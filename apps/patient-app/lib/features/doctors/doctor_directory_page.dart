import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/pagination_controls.dart';
import '../appointments/booking_selection.dart';
import 'doctor_models.dart';
import 'doctor_detail_page.dart';
import 'doctor_booking_controls.dart';
import 'doctor_repository.dart';

class DoctorDirectoryPage extends StatefulWidget {
  const DoctorDirectoryPage(
      {super.key,
      this.tokenProvider,
      this.apiClient,
      this.onSlotSelected,
      this.onAppointmentCreated,
      this.bookingWidgets = const DoctorBookingWidgets()});

  final TokenProvider? tokenProvider;
  final ClinicApiClient? apiClient;
  final void Function(Doctor doctor, DoctorSlot slot)? onSlotSelected;
  final ValueChanged<BookingSelection>? onAppointmentCreated;
  final DoctorBookingWidgets bookingWidgets;

  @override
  State<DoctorDirectoryPage> createState() => _DoctorDirectoryPageState();
}

class _DoctorDirectoryPageState extends State<DoctorDirectoryPage> {
  ClinicApiClient? _api;
  final _specialtySearch = TextEditingController();
  final _doctorSearch = TextEditingController();
  List<Specialty> _specialties = const [];
  List<Doctor> _doctors = const [];
  PageMetadata? _specialtyPagination;
  PageMetadata? _doctorPagination;
  Specialty? _selectedSpecialty;
  int _specialtyPage = 1;
  int _doctorPage = 1;
  bool _loadingDirectory = false;
  ApiException? _directoryError;
  int _directoryRequest = 0;
  RequestCancellation? _directoryCancellation;
  bool _openingDetail = false;

  @override
  void initState() {
    super.initState();
    _api = widget.apiClient ??
        (widget.tokenProvider == null
            ? null
            : ClinicApiClient(tokenProvider: widget.tokenProvider!));
    if (_api != null) _loadDirectory();
  }

  @override
  void didUpdateWidget(covariant DoctorDirectoryPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiClient != widget.apiClient ||
        oldWidget.tokenProvider != widget.tokenProvider) {
      _directoryCancellation?.cancel();
      ++_directoryRequest;
      _doctors = const [];
      _specialties = const [];
      _selectedSpecialty = null;
      _specialtyPagination = null;
      _doctorPagination = null;
      _specialtyPage = 1;
      _doctorPage = 1;
      _api = widget.apiClient ??
          (widget.tokenProvider == null
              ? null
              : ClinicApiClient(tokenProvider: widget.tokenProvider!));
      if (_api != null) _loadDirectory();
    }
  }

  @override
  void dispose() {
    _directoryCancellation?.cancel();
    _specialtySearch.dispose();
    _doctorSearch.dispose();
    super.dispose();
  }

  List<T> _items<T>(
      ApiResponse response, T Function(Map<String, dynamic>) parse) {
    final data = response.data as Map<String, dynamic>;
    final items = data['items'] as List<dynamic>;
    final pagination = response.pagination;
    if (pagination == null ||
        pagination.limit <= 0 ||
        pagination.page < 1 ||
        pagination.total < 0 ||
        items.length > pagination.limit) {
      throw const FormatException('Invalid directory pagination');
    }
    return items
        .map((item) => parse(item as Map<String, dynamic>))
        .toList(growable: false);
  }

  ApiException _unexpected(Object error) => error is ApiException
      ? error
      : const ApiException(
          code: 'INVALID_RESPONSE', message: 'Không thể đọc dữ liệu bác sĩ.');

  Future<void> _loadDirectory() async {
    final api = _api;
    if (api == null) return;
    _directoryCancellation?.cancel();
    final cancellation = _directoryCancellation = RequestCancellation();
    final request = ++_directoryRequest;
    setState(() {
      _loadingDirectory = true;
      _directoryError = null;
    });
    try {
      final results = await Future.wait([
        api.get('/api/v1/specialties', cancellation: cancellation, query: {
          'page': _specialtyPage,
          'limit': 20,
          'q': _specialtySearch.text.trim(),
          'isActive': true,
        }),
        api.get('/api/v1/doctors', cancellation: cancellation, query: {
          'page': _doctorPage,
          'limit': 20,
          'q': _doctorSearch.text.trim(),
          'specialtyId': _selectedSpecialty?.id,
          'isActive': true,
        }),
      ]);
      if (!mounted || request != _directoryRequest) return;
      final specialties = _items(results[0], Specialty.fromJson);
      final doctors = _items(results[1], Doctor.fromJson);
      setState(() {
        _specialties = specialties;
        _doctors = doctors;
        _specialtyPagination = results[0].pagination;
        _doctorPagination = results[1].pagination;
      });
    } catch (error) {
      if (mounted && request == _directoryRequest) {
        setState(() => _directoryError = _unexpected(error));
      }
    } finally {
      if (mounted && request == _directoryRequest) {
        setState(() => _loadingDirectory = false);
      }
    }
  }

  Future<void> _selectDoctor(Doctor doctor) async {
    final api = _api;
    if (api == null || _openingDetail) return;
    _openingDetail = true;
    final booked =
        await Navigator.of(context).push<BookingSelection>(MaterialPageRoute(
      builder: (_) => DoctorDetailPage(
          doctorId: doctor.id,
          apiClient: api,
          specialtyName: _specialties
              .where((item) => item.id == doctor.specialtyId)
              .map((item) => item.name)
              .firstOrNull,
          bookingWidgets: widget.bookingWidgets,
          onSlotSelected: widget.onSlotSelected),
    ));
    if (!mounted) return;
    _openingDetail = false;
    if (booked != null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Đã tạo lịch hẹn. Bạn có thể theo dõi trạng thái trong danh sách.')));
      widget.onAppointmentCreated?.call(booked);
    }
  }

  void _chooseSpecialty(Specialty? specialty) {
    setState(() {
      _selectedSpecialty = specialty;
      _doctorPage = 1;
    });
    _loadDirectory();
  }

  Widget _directorySkeleton(BuildContext context) => Semantics(
        label: 'Đang tải chuyên khoa và bác sĩ',
        liveRegion: true,
        child: Column(
            children: List.generate(
                3,
                (_) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Container(
                          height: 72,
                          decoration: BoxDecoration(
                              color: Theme.of(context)
                                  .colorScheme
                                  .surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(12))),
                    ))),
      );

  @override
  Widget build(BuildContext context) {
    if (_api == null) {
      return const AppErrorState(
          message:
              'Không thể truy cập phiên đăng nhập để tải danh sách bác sĩ.');
    }
    return RefreshIndicator(
      onRefresh: _loadDirectory,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Text('Chuyên khoa', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
                child: TextField(
              controller: _specialtySearch,
              decoration: const InputDecoration(
                  labelText: 'Tìm chuyên khoa', prefixIcon: Icon(Icons.search)),
              onSubmitted: (_) {
                _specialtyPage = 1;
                _loadDirectory();
              },
            )),
            IconButton(
                tooltip: 'Tìm chuyên khoa',
                onPressed: () {
                  _specialtyPage = 1;
                  _loadDirectory();
                },
                icon: const Icon(Icons.arrow_forward)),
          ]),
          if (_directoryError != null)
            AppErrorState(
              message: doctorError(_directoryError!),
              requestId: _directoryError!.requestId,
              onRetry: _loadDirectory,
            )
          else if (_loadingDirectory)
            _directorySkeleton(context)
          else ...[
            if (_specialties.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text('Chưa có chuyên khoa phù hợp.'),
              ),
            Wrap(spacing: 8, runSpacing: 8, children: [
              ChoiceChip(
                  label: const Text('Tất cả'),
                  selected: _selectedSpecialty == null,
                  onSelected: (_) => _chooseSpecialty(null)),
              ..._specialties.map((item) => ChoiceChip(
                  label: Text(item.name),
                  selected: _selectedSpecialty?.id == item.id,
                  onSelected: (_) => _chooseSpecialty(item))),
            ]),
            if (_specialtyPagination != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: IgnorePointer(
                    ignoring: _loadingDirectory,
                    child: PaginationControls(
                        page: _specialtyPage,
                        limit: _specialtyPagination!.limit,
                        total: _specialtyPagination!.total,
                        onPageChanged: (page) {
                          _specialtyPage = page;
                          _loadDirectory();
                        })),
              ),
          ],
          const SizedBox(height: 24),
          Text('Bác sĩ', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
                child: TextField(
              controller: _doctorSearch,
              decoration: const InputDecoration(
                  labelText: 'Tìm bác sĩ', prefixIcon: Icon(Icons.search)),
              onSubmitted: (_) {
                _doctorPage = 1;
                _loadDirectory();
              },
            )),
            IconButton(
                tooltip: 'Tìm bác sĩ',
                onPressed: () {
                  _doctorPage = 1;
                  _loadDirectory();
                },
                icon: const Icon(Icons.arrow_forward)),
          ]),
          if (!_loadingDirectory && _directoryError == null && _doctors.isEmpty)
            Column(children: [
              const AppEmptyState(
                title: 'Chưa có bác sĩ',
                message: 'Thử chuyên khoa hoặc từ khóa khác.',
                icon: Icons.medical_services_outlined,
              ),
              TextButton(
                  onPressed: () {
                    _specialtySearch.clear();
                    _doctorSearch.clear();
                    setState(() {
                      _selectedSpecialty = null;
                      _specialtyPage = 1;
                      _doctorPage = 1;
                    });
                    _loadDirectory();
                  },
                  child: const Text('Xóa bộ lọc')),
            ]),
          if (!_loadingDirectory && _directoryError == null)
            ..._doctors.map((doctor) => Card(
                  child: ListTile(
                    title: Text(doctor.displayName),
                    subtitle: Text(_specialties
                            .where((item) => item.id == doctor.specialtyId)
                            .map((item) => item.name)
                            .firstOrNull ??
                        'Xem chuyên khoa và lịch khám'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _selectDoctor(doctor),
                  ),
                )),
          if (_doctorPagination != null)
            IgnorePointer(
                ignoring: _loadingDirectory,
                child: PaginationControls(
                  page: _doctorPage,
                  limit: _doctorPagination!.limit,
                  total: _doctorPagination!.total,
                  onPageChanged: (page) {
                    _doctorPage = page;
                    _loadDirectory();
                  },
                )),
        ],
      ),
    );
  }
}
