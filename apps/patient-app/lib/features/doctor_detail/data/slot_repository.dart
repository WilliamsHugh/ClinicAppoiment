import '../../../core/api/clinic_api_client.dart';

class Slot {
  const Slot({required this.startAt, required this.endAt});
  final DateTime startAt;
  final DateTime endAt;

  String get label {
    final h = startAt.hour.toString().padLeft(2, '0');
    final m = startAt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class SlotRepository {
  SlotRepository(this._api);
  final ClinicApiClient _api;

  Future<List<Slot>> fetchAvailable(String doctorId, String isoDate) async {
    final res = await _api.get('/api/v1/doctors/$doctorId/available-slots',
        query: {'date': isoDate});
    final raw = res.data;
    final list = raw is List
        ? raw
        : raw is Map<String, dynamic> && raw['slots'] is List
            ? raw['slots'] as List
            : <Object?>[];
    return list
        .whereType<Map<String, dynamic>>()
        .map((e) => Slot(
              startAt: DateTime.parse(e['startAt'].toString()),
              endAt: DateTime.parse(e['endAt'].toString()),
            ))
        .toList();
  }
}
