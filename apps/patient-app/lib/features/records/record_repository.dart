import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import 'record_models.dart';

class _DoctorLookupEntry {
  const _DoctorLookupEntry._({this.displayName, required this.unavailable});

  const _DoctorLookupEntry.loaded(String name)
      : this._(displayName: name, unavailable: false);

  const _DoctorLookupEntry.unavailable()
      : this._(displayName: null, unavailable: true);

  final String? displayName;
  final bool unavailable;
}

class _InFlightLookup {
  const _InFlightLookup(this.future, this.cancellation);

  final Future<void> future;
  final RequestCancellation? cancellation;
}

class RecordRepository {
  RecordRepository(this._api);

  final ClinicApiClient _api;
  final Map<String, _DoctorLookupEntry> _doctorNames = {};
  final Map<String, _InFlightLookup> _inFlightDoctorLookups = {};

  static const int _maxDoctorLookupConcurrency = 5;

  String? cachedDoctorName(String doctorId) =>
      _doctorNames[doctorId]?.displayName;

  bool isDoctorUnavailable(String doctorId) =>
      _doctorNames[doctorId]?.unavailable ?? false;

  void clearCache() {
    _doctorNames.clear();
    _inFlightDoctorLookups.clear();
  }

  Future<RecordPageResult> fetchRecords({
    int page = 1,
    int limit = 20,
    String? appointmentId,
    RequestCancellation? cancellation,
  }) async {
    final trimmedAppointmentId = appointmentId?.trim();
    final response = await _api.get(
      '/api/v1/medical-records',
      query: {
        'page': page,
        'limit': limit,
        if (trimmedAppointmentId != null && trimmedAppointmentId.isNotEmpty)
          'appointmentId': trimmedAppointmentId,
      },
      cancellation: cancellation,
    );

    final rawData = response.data;
    if (rawData is! Map) {
      throw const FormatException('Invalid medical records payload');
    }
    final data = Map<String, dynamic>.from(rawData);
    final rawItems = data['items'];
    if (rawItems is! List) {
      throw const FormatException('Invalid medical records items list');
    }

    final parsedItems = <MedicalRecord>[];
    for (final rawItem in rawItems) {
      if (rawItem is! Map) {
        throw const FormatException('Invalid medical record entry');
      }
      var record = MedicalRecord.fromJson(Map<String, dynamic>.from(rawItem));
      final doctorId = record.doctorId;
      if (doctorId != null && doctorId.isNotEmpty) {
        final cached = _doctorNames[doctorId]?.displayName;
        if (cached != null && cached.isNotEmpty) {
          record = record.copyWith(doctorName: cached);
        }
      }
      parsedItems.add(record);
    }

    final pagination = response.pagination;
    final resolvedPage =
        pagination?.page ?? (data['page'] is int ? data['page'] as int : page);
    final resolvedLimit = pagination?.limit ??
        (data['limit'] is int ? data['limit'] as int : limit);
    final resolvedTotal = pagination?.total ??
        (data['total'] is int ? data['total'] as int : parsedItems.length);

    return RecordPageResult(
      items: List<MedicalRecord>.unmodifiable(parsedItems),
      page: resolvedPage,
      limit: resolvedLimit,
      total: resolvedTotal,
    );
  }

  Future<Map<String, String>> enrichDoctorNames(
    Iterable<String?> doctorIds, {
    RequestCancellation? cancellation,
  }) async {
    final targetIds = doctorIds
        .whereType<String>()
        .map((id) => id.trim())
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList(growable: false);

    final missingIds = targetIds
        .where((id) => !_doctorNames.containsKey(id))
        .toList(growable: false);

    if (missingIds.isNotEmpty) {
      var nextIndex = 0;
      final workerCount =
          missingIds.length.clamp(0, _maxDoctorLookupConcurrency);
      await Future.wait(
        List.generate(workerCount, (_) async {
          while (nextIndex < missingIds.length) {
            if (cancellation?.isCancelled ?? false) {
              throw const ApiException(
                code: 'REQUEST_CANCELLED',
                message: 'Yêu cầu đã bị hủy.',
              );
            }
            final doctorId = missingIds[nextIndex++];
            await _lookupDoctorName(doctorId, cancellation: cancellation);
          }
        }),
      );
    }

    final resolved = <String, String>{};
    for (final id in targetIds) {
      final name = _doctorNames[id]?.displayName;
      if (name != null && name.isNotEmpty) {
        resolved[id] = name;
      }
    }
    return resolved;
  }

  Future<void> _lookupDoctorName(
    String doctorId, {
    RequestCancellation? cancellation,
  }) {
    final existing = _inFlightDoctorLookups[doctorId];
    if (existing != null && !(existing.cancellation?.isCancelled ?? false)) {
      return existing.future;
    }

    late final _InFlightLookup entry;
    final future = () async {
      try {
        final response = await _api.get(
          '/api/v1/doctors/${Uri.encodeComponent(doctorId)}',
          cancellation: cancellation,
        );
        final data = response.data;
        if (data is Map) {
          final cleanName = cleanDoctorName(data['displayName']);
          if (cleanName != null) {
            _doctorNames[doctorId] = _DoctorLookupEntry.loaded(cleanName);
          }
        }
      } on ApiException catch (error) {
        if ((cancellation?.isCancelled ?? false) ||
            error.code == 'REQUEST_CANCELLED' ||
            error.requiresAuthentication) {
          rethrow;
        }
        if (error.statusCode == 404 || error.statusCode == 400) {
          _doctorNames[doctorId] = const _DoctorLookupEntry.unavailable();
        }
      } catch (_) {
        // Fallback gracefully when doctor lookup fails with a non-auth error.
      } finally {
        if (identical(_inFlightDoctorLookups[doctorId], entry)) {
          _inFlightDoctorLookups.remove(doctorId);
        }
      }
    }();

    entry = _InFlightLookup(future, cancellation);
    _inFlightDoctorLookups[doctorId] = entry;
    return future;
  }
}
