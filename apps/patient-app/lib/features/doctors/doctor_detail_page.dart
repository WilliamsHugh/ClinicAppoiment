import 'package:flutter/material.dart';

import '../../core/api/clinic_api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/clinic_page_header.dart';
import '../appointments/booking_confirmation_sheet.dart';
import '../appointments/booking_selection.dart';
import 'doctor_booking_controls.dart';
import 'doctor_models.dart';
import 'doctor_repository.dart';

class DoctorDetailPage extends StatefulWidget {
  const DoctorDetailPage(
      {required this.doctorId,
      required this.apiClient,
      this.specialtyName,
      this.bookingWidgets = const DoctorBookingWidgets(),
      this.onSlotSelected,
      super.key});
  final String doctorId;
  final ClinicApiClient apiClient;
  final String? specialtyName;
  final DoctorBookingWidgets bookingWidgets;
  final void Function(Doctor, DoctorSlot)? onSlotSelected;

  @override
  State<DoctorDetailPage> createState() => _DoctorDetailPageState();
}

class _DoctorDetailPageState extends State<DoctorDetailPage> {
  late final DoctorRepository _repository;
  Doctor? _doctor;
  String? _specialtyName;
  String? _detailError;
  String? _scheduleError;
  String? _specialtyError;
  String? _slotError;
  List<DoctorSchedule> _schedules = const [];
  List<DoctorSlot> _slots = const [];
  final Map<String, Map<String, DoctorSlot>> _seen = {};
  String _date = clinicTodayDate();
  bool _loadingDetail = true;
  bool _loadingSchedule = true;
  bool _loadingSpecialty = false;
  bool _loadingSlots = true;
  bool _confirming = false;
  bool _returning = false;
  int _detailRequest = 0;
  int _scheduleRequest = 0;
  int _slotRequest = 0;
  int _specialtyRequest = 0;
  RequestCancellation? _detailCancellation;
  RequestCancellation? _scheduleCancellation;
  RequestCancellation? _slotCancellation;
  RequestCancellation? _specialtyCancellation;

  @override
  void initState() {
    super.initState();
    _repository = DoctorRepository(widget.apiClient);
    _specialtyName = widget.specialtyName;
    _loadDoctor();
  }

  @override
  void dispose() {
    _detailCancellation?.cancel();
    _scheduleCancellation?.cancel();
    _slotCancellation?.cancel();
    _specialtyCancellation?.cancel();
    super.dispose();
  }

  Future<void> _loadDoctor() async {
    _detailCancellation?.cancel();
    _scheduleCancellation?.cancel();
    _slotCancellation?.cancel();
    _specialtyCancellation?.cancel();
    final cancellation = _detailCancellation = RequestCancellation();
    final request = ++_detailRequest;
    ++_scheduleRequest;
    ++_slotRequest;
    ++_specialtyRequest;
    setState(() {
      _loadingDetail = true;
      _detailError = null;
      _slots = const [];
      _loadingSlots = true;
    });
    try {
      final doctor =
          await _repository.doctor(widget.doctorId, cancellation: cancellation);
      if (!mounted || request != _detailRequest) return;
      setState(() => _doctor = doctor);
      if (!doctor.isActive) {
        setState(() {
          _loadingSchedule = false;
          _loadingSlots = false;
        });
        return;
      }
      await Future.wait([
        _loadSchedules(),
        _loadSlots(),
        if (_specialtyName == null) _loadSpecialty()
      ]);
    } catch (error) {
      if (mounted && request == _detailRequest) {
        setState(() {
          _detailError = doctorError(error);
          _loadingSlots = false;
        });
      }
    } finally {
      if (mounted && request == _detailRequest) {
        setState(() => _loadingDetail = false);
      }
    }
  }

  Future<void> _loadSchedules() async {
    _scheduleCancellation?.cancel();
    final cancellation = _scheduleCancellation = RequestCancellation();
    final request = ++_scheduleRequest;
    setState(() {
      _loadingSchedule = true;
      _scheduleError = null;
    });
    try {
      final values = await _repository.schedules(widget.doctorId,
          cancellation: cancellation);
      if (mounted && request == _scheduleRequest) {
        setState(() => _schedules = values);
      }
    } catch (error) {
      if (mounted && request == _scheduleRequest) {
        setState(() => _scheduleError = doctorError(error));
      }
    } finally {
      if (mounted && request == _scheduleRequest) {
        setState(() => _loadingSchedule = false);
      }
    }
  }

  Future<void> _loadSpecialty() async {
    final doctor = _doctor;
    if (doctor == null) return;
    _specialtyCancellation?.cancel();
    final cancellation = _specialtyCancellation = RequestCancellation();
    final request = ++_specialtyRequest;
    setState(() {
      _loadingSpecialty = true;
      _specialtyError = null;
    });
    try {
      final value = await _repository.specialtyName(doctor.specialtyId,
          cancellation: cancellation);
      if (mounted && request == _specialtyRequest) {
        setState(() => _specialtyName = value);
      }
    } catch (error) {
      if (mounted && request == _specialtyRequest) {
        setState(() => _specialtyError = doctorError(error));
      }
    } finally {
      if (mounted && request == _specialtyRequest) {
        setState(() => _loadingSpecialty = false);
      }
    }
  }

  Future<void> _loadSlots() async {
    if (_doctor?.isActive != true) return;
    _slotCancellation?.cancel();
    final cancellation = _slotCancellation = RequestCancellation();
    final request = ++_slotRequest;
    final date = _date;
    setState(() {
      _loadingSlots = true;
      _slotError = null;
      _slots = const [];
    });
    try {
      final values = await _repository.slots(widget.doctorId, date,
          cancellation: cancellation);
      if (!mounted || request != _slotRequest) return;
      setState(() {
        _slots = values;
        final seen = _seen.putIfAbsent(date, () => {});
        for (final slot in values) {
          seen[slotKey(slot)] = slot;
        }
      });
    } catch (error) {
      if (mounted && request == _slotRequest) {
        setState(() => _slotError = doctorError(error));
      }
    } finally {
      if (mounted && request == _slotRequest) {
        setState(() => _loadingSlots = false);
      }
    }
  }

  Future<void> _setDate(String date) async {
    if (_confirming || _returning) return;
    final parsed = tryParseClinicDateUtc(date);
    final first = clinicTodayDate();
    final last = addClinicDays(first, 365);
    if (parsed == null ||
        date.compareTo(first) < 0 ||
        date.compareTo(last) > 0) {
      return;
    }
    setState(() => _date = date);
    await _loadSlots();
  }

  Future<void> _chooseDate() async {
    final firstStr = clinicTodayDate();
    final lastStr = addClinicDays(firstStr, 365);
    final firstUtc = tryParseClinicDateUtc(firstStr)!;
    final lastUtc = tryParseClinicDateUtc(lastStr)!;
    final selectedUtc = tryParseClinicDateUtc(_date) ?? firstUtc;
    final first = DateTime(firstUtc.year, firstUtc.month, firstUtc.day);
    final last = DateTime(lastUtc.year, lastUtc.month, lastUtc.day);
    final initial = DateTime(selectedUtc.year, selectedUtc.month, selectedUtc.day);
    final chosen = await showDatePicker(
        context: context,
        initialDate: initial.isBefore(first) ? first : initial,
        firstDate: first,
        lastDate: last,
        helpText: 'Chọn ngày khám (giờ Việt Nam)');
    if (chosen == null || !mounted) return;
    await _setDate(formatClinicDate(chosen));
  }

  Future<void> _confirmSlot(DoctorSlot slot) async {
    final doctor = _doctor;
    if (doctor == null ||
        !doctor.isActive ||
        _confirming ||
        _returning ||
        _loadingSlots ||
        _slotError != null ||
        !_slots.any((value) => slotKey(value) == slotKey(slot)) ||
        !slot.startAt.isAfter(DateTime.now().toUtc())) {
      return;
    }
    setState(() => _confirming = true);
    widget.onSlotSelected?.call(doctor, slot);
    final booked = await showBookingConfirmationSheet(context,
        selection: BookingSelection.fromDoctorSlot(doctor, slot),
        api: widget.apiClient);
    if (!mounted) return;
    setState(() {
      _confirming = false;
      _returning = booked != null;
    });
    if (booked != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop(booked);
      });
    } else {
      await _loadSlots();
    }
  }

  String _initials(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return 'BS';
    final words = trimmed.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
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
    var skipping = true;
    for (final w in words) {
      if (skipping && prefixes.contains(w.toLowerCase())) continue;
      skipping = false;
      filtered.add(w);
    }
    final target = filtered.isNotEmpty ? filtered : words;
    if (target.length >= 2) {
      return '${target.first.characters.first}${target.last.characters.first}'
          .toUpperCase();
    }
    return target.first.characters.first.toUpperCase();
  }

  Widget _skeleton(String label) => Semantics(
      label: label,
      liveRegion: true,
      child: Column(
          children: List.generate(
              3,
              (_) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Container(
                        height: 36,
                        decoration: BoxDecoration(
                            color: ClinicColors.surfaceSubtle,
                            borderRadius: BorderRadius.circular(10))),
                  ))));

  Widget _sectionCard({
    required String title,
    required IconData icon,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: ClinicColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  Widget _heroProfileCard(Doctor doctor) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [ClinicColors.primary, ClinicColors.primaryDark],
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              color: ClinicColors.primarySoft,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              _initials(doctor.displayName),
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: ClinicColors.primary,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  doctor.displayName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    height: 1.2,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                if (_loadingSpecialty)
                  Semantics(
                    label: 'Đang tải chuyên khoa',
                    liveRegion: true,
                    child: Container(
                      height: 24,
                      width: 140,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  )
                else if (_specialtyError != null)
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: ClinicColors.card,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: AppErrorState(
                      message: _specialtyError!,
                      onRetry: _loadSpecialty,
                    ),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'Chuyên khoa: ${_specialtyName ?? 'Chưa có thông tin'}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: doctor.isActive
                        ? ClinicColors.successLight
                        : ClinicColors.dangerLight,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: doctor.isActive
                              ? ClinicColors.success
                              : ClinicColors.danger,
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
                            fontWeight: FontWeight.w700,
                            color: doctor.isActive
                                ? ClinicColors.success
                                : ClinicColors.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _weeklySchedule() {
    if (_loadingSchedule) return _skeleton('Đang tải lịch làm việc');
    if (_scheduleError != null) {
      return AppErrorState(message: _scheduleError!, onRetry: _loadSchedules);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (_schedules.isEmpty)
        const Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: Text(
            'Bác sĩ chưa công bố lịch làm việc tuần.',
            style: TextStyle(color: ClinicColors.muted),
          ),
        ),
      ...[1, 2, 3, 4, 5, 6, 0].map((day) {
        final sessions =
            _schedules.where((item) => item.weekday == day).toList();
        final active = sessions.isNotEmpty;
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 7),
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: ClinicColors.border, width: 0.75),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                clinicWeekdays[day],
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: active ? ClinicColors.ink : ClinicColors.muted,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                sessions.isEmpty
                    ? 'Không có lịch định kỳ'
                    : sessions
                        .map((item) =>
                            '${item.startTime}–${item.endTime} · ${item.slotDurationMinutes} phút/lượt')
                        .join('\n'),
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  color: active ? ClinicColors.primaryDark : ClinicColors.muted,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ],
          ),
        );
      }),
      const SizedBox(height: 4),
      const Text(
        'Lịch tuần là lịch định kỳ. Khung giờ trống bên dưới được cập nhật riêng theo ngày.',
        style: TextStyle(fontSize: 12.5, height: 1.4, color: ClinicColors.muted),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final doctor = _doctor;
    final first = clinicTodayDate();
    final last = addClinicDays(first, 365);
    final dateInput = DoctorDateInput(
        selectedDate: _date,
        firstDate: first,
        lastDate: last,
        onChanged: _setDate,
        onOpenCalendar: _chooseDate,
        enabled: !_confirming && !_returning && !_loadingDetail);
    final available = _slots.map(slotKey).toSet();
    final seen = (_seen[_date]?.values ?? <DoctorSlot>[])
        .where((slot) => slot.startAt.isAfter(DateTime.now().toUtc()))
        .toList()
      ..sort((a, b) => a.startAt.compareTo(b.startAt));
    final slotInput = DoctorSlotInput(
        slots: seen,
        unavailableKeys:
            seen.map(slotKey).where((key) => !available.contains(key)).toSet(),
        onSelected: _confirmSlot,
        enabled: !_confirming &&
            !_returning &&
            !_loadingSlots &&
            _slotError == null &&
            doctor?.isActive == true);
    return PopScope(
      canPop: !_confirming,
      child: Scaffold(
        backgroundColor: ClinicColors.scaffold,
        body: Column(
          children: [
            ClinicPageHeader(
              title: 'Chi tiết bác sĩ',
              subtitle: 'Hồ sơ chuyên môn & đặt lịch khám',
              leading: IconButton(
                tooltip: 'Back',
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.arrow_back, color: Colors.white),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _confirming ? () async {} : _loadDoctor,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    if (_loadingDetail && doctor == null)
                      _skeleton('Đang tải thông tin bác sĩ')
                    else if (_detailError != null)
                      AppErrorState(
                          message: _detailError!, onRetry: _loadDoctor)
                    else if (doctor != null) ...[
                      _heroProfileCard(doctor),
                      const SizedBox(height: 16),
                      _sectionCard(
                        title: 'Giới thiệu',
                        icon: Icons.badge_outlined,
                        child: Text(
                          doctor.bio?.trim().isNotEmpty == true
                              ? doctor.bio!.trim()
                              : 'Bác sĩ chưa cập nhật giới thiệu chuyên môn.',
                          style: const TextStyle(
                            fontSize: 14,
                            height: 1.45,
                            color: ClinicColors.muted,
                          ),
                        ),
                      ),
                      if (!doctor.isActive) ...[
                        const SizedBox(height: 16),
                        Container(
                          decoration: BoxDecoration(
                            color: ClinicColors.card,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: ClinicColors.border),
                          ),
                          child: const AppEmptyState(
                            title: 'Bác sĩ hiện không nhận lịch',
                            message: 'Quay lại danh sách để chọn bác sĩ khác.',
                            icon: Icons.event_busy_outlined,
                          ),
                        ),
                      ] else ...[
                        const SizedBox(height: 16),
                        _sectionCard(
                          title: 'Lịch làm việc tuần',
                          icon: Icons.calendar_view_week_outlined,
                          child: _weeklySchedule(),
                        ),
                        const SizedBox(height: 16),
                        _sectionCard(
                          title: 'Chọn khung giờ khám',
                          icon: Icons.schedule_outlined,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Giờ Việt Nam (UTC+7). Khung giờ chỉ được xác nhận sau khi đặt lịch thành công.',
                                style: TextStyle(
                                  fontSize: 13,
                                  height: 1.4,
                                  color: ClinicColors.muted,
                                ),
                              ),
                              const SizedBox(height: 12),
                              widget.bookingWidgets.dateStrip
                                      ?.call(context, dateInput) ??
                                  DoctorDateControl(input: dateInput),
                              const SizedBox(height: 16),
                              if (_loadingSlots)
                                _skeleton('Đang tải khung giờ')
                              else if (_slotError != null)
                                AppErrorState(
                                    message: _slotError!, onRetry: _loadSlots)
                              else ...[
                                if (_slots.isEmpty)
                                  Column(
                                    children: [
                                      const AppEmptyState(
                                        title: 'Chưa có khung giờ trống',
                                        message:
                                            'Hãy chọn ngày khác hoặc kiểm tra lại.',
                                        icon: Icons.event_busy_outlined,
                                      ),
                                      TextButton(
                                        onPressed: _loadSlots,
                                        child: const Text('Tải lại khung giờ'),
                                      ),
                                    ],
                                  ),
                                widget.bookingWidgets.slotSelector
                                        ?.call(context, slotInput) ??
                                    DoctorSlotControl(input: slotInput),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
