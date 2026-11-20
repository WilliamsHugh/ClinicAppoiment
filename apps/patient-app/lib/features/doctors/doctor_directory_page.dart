import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/clinic_search_field.dart';
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
  static const _searchDebounce = Duration(milliseconds: 350);

  ClinicApiClient? _api;
  DoctorRepository? _repository;
  final _specialtySearch = TextEditingController();
  final _doctorSearch = TextEditingController();
  Timer? _specialtySearchTimer;
  Timer? _doctorSearchTimer;
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
    _configureClient();
    if (_api != null) _loadDirectory();
  }

  void _configureClient() {
    _api = widget.apiClient ??
        (widget.tokenProvider == null
            ? null
            : ClinicApiClient(tokenProvider: widget.tokenProvider!));
    _repository = _api == null ? null : DoctorRepository(_api!);
  }

  @override
  void didUpdateWidget(covariant DoctorDirectoryPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiClient != widget.apiClient ||
        oldWidget.tokenProvider != widget.tokenProvider) {
      _specialtySearchTimer?.cancel();
      _doctorSearchTimer?.cancel();
      _directoryCancellation?.cancel();
      ++_directoryRequest;
      _doctors = const [];
      _specialties = const [];
      _selectedSpecialty = null;
      _specialtyPagination = null;
      _doctorPagination = null;
      _specialtyPage = 1;
      _doctorPage = 1;
      _configureClient();
      if (_api != null) _loadDirectory();
    }
  }

  @override
  void dispose() {
    _specialtySearchTimer?.cancel();
    _doctorSearchTimer?.cancel();
    _directoryCancellation?.cancel();
    _specialtySearch.dispose();
    _doctorSearch.dispose();
    super.dispose();
  }

  ApiException _unexpected(Object error) => error is ApiException
      ? error
      : const ApiException(
          code: 'INVALID_RESPONSE', message: 'Không thể đọc dữ liệu bác sĩ.');

  Future<void> _loadDirectory() async {
    final repository = _repository;
    if (repository == null) return;
    _directoryCancellation?.cancel();
    final cancellation = _directoryCancellation = RequestCancellation();
    final request = ++_directoryRequest;
    setState(() {
      _loadingDirectory = true;
      _directoryError = null;
    });
    try {
      final specialtiesFuture = repository.specialties(
        page: _specialtyPage,
        limit: 20,
        q: _specialtySearch.text,
        cancellation: cancellation,
      );
      final doctorsFuture = repository.doctors(
        page: _doctorPage,
        limit: 20,
        specialtyId: _selectedSpecialty?.id,
        q: _doctorSearch.text,
        cancellation: cancellation,
      );
      await Future.wait([specialtiesFuture, doctorsFuture]);
      final specialtyPage = await specialtiesFuture;
      final doctorPage = await doctorsFuture;
      if (!mounted || request != _directoryRequest) return;
      setState(() {
        _specialties = specialtyPage.items;
        _doctors = doctorPage.items;
        _specialtyPagination = specialtyPage.pagination;
        _doctorPagination = doctorPage.pagination;
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

  String? _resolveSpecialtyName(String specialtyId) {
    final fromCurrent = _specialties
        .where((item) => item.id == specialtyId)
        .map((item) => item.name)
        .firstOrNull;
    if (fromCurrent != null) return fromCurrent;
    if (_selectedSpecialty?.id == specialtyId) {
      return _selectedSpecialty!.name;
    }
    return _repository?.cachedSpecialtyName(specialtyId);
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
          specialtyName: _resolveSpecialtyName(doctor.specialtyId),
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

  void _onSpecialtySearchChanged(String _) {
    _specialtySearchTimer?.cancel();
    _specialtySearchTimer = Timer(_searchDebounce, () {
      if (!mounted) return;
      _specialtyPage = 1;
      _loadDirectory();
    });
  }

  void _onSpecialtySearchSubmitted(String _) {
    _specialtySearchTimer?.cancel();
    _specialtyPage = 1;
    _loadDirectory();
  }

  void _onSpecialtySearchClear() {
    _specialtySearchTimer?.cancel();
    _specialtyPage = 1;
    _loadDirectory();
  }

  void _onDoctorSearchChanged(String _) {
    _doctorSearchTimer?.cancel();
    _doctorSearchTimer = Timer(_searchDebounce, () {
      if (!mounted) return;
      _doctorPage = 1;
      _loadDirectory();
    });
  }

  void _onDoctorSearchSubmitted(String _) {
    _doctorSearchTimer?.cancel();
    _doctorPage = 1;
    _loadDirectory();
  }

  void _onDoctorSearchClear() {
    _doctorSearchTimer?.cancel();
    _doctorPage = 1;
    _loadDirectory();
  }

  void _clearAllFilters() {
    _specialtySearchTimer?.cancel();
    _doctorSearchTimer?.cancel();
    _specialtySearch.clear();
    _doctorSearch.clear();
    setState(() {
      _selectedSpecialty = null;
      _specialtyPage = 1;
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
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                          height: 112,
                          decoration: BoxDecoration(
                              color: ClinicColors.surfaceSubtle,
                              borderRadius: BorderRadius.circular(16))),
                    ))),
      );

  Widget _specialtyChip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      selectedColor: ClinicColors.primarySoft,
      backgroundColor: ClinicColors.card,
      checkmarkColor: ClinicColors.primary,
      side: BorderSide(
        color: selected ? ClinicColors.primary : ClinicColors.border,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      labelStyle: TextStyle(
        color: selected ? ClinicColors.primary : ClinicColors.ink,
        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
      ),
      onSelected: (_) => onTap(),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_api == null) {
      return const AppErrorState(
          message:
              'Không thể truy cập phiên đăng nhập để tải danh sách bác sĩ.');
    }

    final displaySpecialties = <Specialty>[
      if (_selectedSpecialty != null &&
          !_specialties.any((item) => item.id == _selectedSpecialty!.id))
        _selectedSpecialty!,
      ..._specialties,
    ];

    final showSpecialtyPagination = _specialtyPagination != null &&
        _specialtyPagination!.total > _specialtyPagination!.limit;
    final showDoctorPagination = _doctorPagination != null &&
        _doctorPagination!.total > _doctorPagination!.limit;

    return RefreshIndicator(
      onRefresh: _loadDirectory,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const Text(
            'Chuyên khoa',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: ClinicColors.ink,
            ),
          ),
          const SizedBox(height: 10),
          ClinicSearchField(
            controller: _specialtySearch,
            hintText: 'Tìm chuyên khoa...',
            semanticsLabel: 'Tìm chuyên khoa',
            onChanged: _onSpecialtySearchChanged,
            onSubmitted: _onSpecialtySearchSubmitted,
            onClear: _onSpecialtySearchClear,
          ),
          const SizedBox(height: 10),
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
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  'Chưa có chuyên khoa phù hợp.',
                  style: TextStyle(color: ClinicColors.muted),
                ),
              ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  _specialtyChip(
                    label: 'Tất cả',
                    selected: _selectedSpecialty == null,
                    onTap: () => _chooseSpecialty(null),
                  ),
                  for (final item in displaySpecialties) ...[
                    const SizedBox(width: 8),
                    _specialtyChip(
                      label: item.name,
                      selected: _selectedSpecialty?.id == item.id,
                      onTap: () => _chooseSpecialty(item),
                    ),
                  ],
                ],
              ),
            ),
            if (showSpecialtyPagination)
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
                    },
                  ),
                ),
              ),
          ],
          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Bác sĩ',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink,
                  ),
                ),
              ),
              if (!_loadingDirectory &&
                  _directoryError == null &&
                  _doctorPagination != null)
                Text(
                  '${_doctorPagination!.total} bác sĩ',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: ClinicColors.muted,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          ClinicSearchField(
            controller: _doctorSearch,
            hintText: 'Tìm bác sĩ theo tên...',
            semanticsLabel: 'Tìm bác sĩ',
            onChanged: _onDoctorSearchChanged,
            onSubmitted: _onDoctorSearchSubmitted,
            onClear: _onDoctorSearchClear,
          ),
          const SizedBox(height: 12),
          if (!_loadingDirectory && _directoryError == null && _doctors.isEmpty)
            Column(
              children: [
                const AppEmptyState(
                  title: 'Chưa có bác sĩ',
                  message: 'Thử chuyên khoa hoặc từ khóa khác.',
                  icon: Icons.medical_services_outlined,
                ),
                TextButton(
                  onPressed: _clearAllFilters,
                  child: const Text('Xóa bộ lọc'),
                ),
              ],
            ),
          if (!_loadingDirectory && _directoryError == null)
            ..._doctors.map((doctor) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _DoctorCard(
                    doctor: doctor,
                    specialtyName: _resolveSpecialtyName(doctor.specialtyId),
                    onTap: () => _selectDoctor(doctor),
                  ),
                )),
          if (showDoctorPagination)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: IgnorePointer(
                ignoring: _loadingDirectory,
                child: PaginationControls(
                  page: _doctorPage,
                  limit: _doctorPagination!.limit,
                  total: _doctorPagination!.total,
                  onPageChanged: (page) {
                    _doctorPage = page;
                    _loadDirectory();
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}

String _doctorInitials(String displayName) {
  final trimmed = displayName.trim();
  if (trimmed.isEmpty) return 'BS';
  final words = trimmed
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .toList();
  const prefixes = {
    'bs',
    'bs.',
    'bác',
    'sĩ',
    'ths',
    'ths.',
    'ts',
    'ts.',
    'pgs',
    'pgs.',
    'gs',
    'gs.',
  };
  final filtered = <String>[];
  var skippingPrefix = true;
  for (final word in words) {
    if (skippingPrefix && prefixes.contains(word.toLowerCase())) {
      continue;
    }
    skippingPrefix = false;
    filtered.add(word);
  }
  final target = filtered.isNotEmpty ? filtered : words;
  if (target.length >= 2) {
    return '${target.first.characters.first}${target.last.characters.first}'
        .toUpperCase();
  }
  return target.first.characters.first.toUpperCase();
}

class _DoctorCard extends StatelessWidget {
  const _DoctorCard({
    required this.doctor,
    required this.specialtyName,
    required this.onTap,
  });

  final Doctor doctor;
  final String? specialtyName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final specialtyLabel = specialtyName ?? 'Xem chuyên khoa và lịch khám';
    final bio = doctor.bio?.trim();

    return Material(
      color: ClinicColors.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: ClinicColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: const BoxDecoration(
                      color: ClinicColors.primarySoft,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      _doctorInitials(doctor.displayName),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: ClinicColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          doctor.displayName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            height: 1.25,
                            color: ClinicColors.ink,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: ClinicColors.primarySoft,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            specialtyLabel,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: ClinicColors.primary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (bio != null && bio.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  bio,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13.5,
                    height: 1.4,
                    color: ClinicColors.muted,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              const Divider(height: 1, color: ClinicColors.border),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: doctor.isActive
                                ? ClinicColors.success
                                : ClinicColors.mutedLight,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            doctor.isActive
                                ? 'Đang nhận lịch'
                                : 'Tạm ngưng nhận lịch',
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: doctor.isActive
                                  ? ClinicColors.success
                                  : ClinicColors.muted,
                            ),
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: ClinicColors.primarySoft,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Đặt lịch khám',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: ClinicColors.primary,
                            ),
                          ),
                          SizedBox(width: 4),
                          Icon(
                            Icons.arrow_forward_rounded,
                            size: 16,
                            color: ClinicColors.primary,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
