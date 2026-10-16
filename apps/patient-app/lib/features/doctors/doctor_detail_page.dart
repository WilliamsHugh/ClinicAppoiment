import 'package:flutter/material.dart';

import '../../core/api/clinic_api_client.dart';
import '../../shared/widgets/async_states.dart';
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
  String _date = clinicDate(DateTime.now());
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
    _slotCancellation?.cancel();
    final cancellation = _detailCancellation = RequestCancellation();
    final request = ++_detailRequest;
    ++_slotRequest;
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
    final parsed = DateTime.tryParse(date);
    final today = DateTime.parse(clinicDate(DateTime.now()));
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date) ||
        parsed == null ||
        parsed.toIso8601String().substring(0, 10) != date ||
        parsed.isBefore(today) ||
        parsed.isAfter(today.add(const Duration(days: 365)))) {
      return;
    }
    setState(() => _date = date);
    await _loadSlots();
  }

  Future<void> _chooseDate() async {
    final first = DateTime.parse(clinicDate(DateTime.now()));
    final chosen = await showDatePicker(
        context: context,
        initialDate: DateTime.parse(_date).isBefore(first)
            ? first
            : DateTime.parse(_date),
        firstDate: first,
        lastDate: first.add(const Duration(days: 365)),
        helpText: 'Chọn ngày khám (giờ Việt Nam)');
    if (chosen == null || !mounted) return;
    await _setDate(
        '${chosen.year.toString().padLeft(4, '0')}-${chosen.month.toString().padLeft(2, '0')}-${chosen.day.toString().padLeft(2, '0')}');
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
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(8))),
                  ))));

  Widget _weeklySchedule() {
    if (_loadingSchedule) return _skeleton('Đang tải lịch làm việc');
    if (_scheduleError != null) {
      return AppErrorState(message: _scheduleError!, onRetry: _loadSchedules);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (_schedules.isEmpty)
        const Text('Bác sĩ chưa công bố lịch làm việc tuần.'),
      ...[1, 2, 3, 4, 5, 6, 0].map((day) {
        final sessions =
            _schedules.where((item) => item.weekday == day).toList();
        return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(clinicWeekdays[day],
                  style: Theme.of(context).textTheme.titleSmall),
              Text(sessions.isEmpty
                  ? 'Không có lịch định kỳ'
                  : sessions
                      .map((item) =>
                          '${item.startTime}–${item.endTime} · ${item.slotDurationMinutes} phút/lượt')
                      .join('\n')),
            ]));
      }),
      const SizedBox(height: 8),
      const Text(
          'Lịch tuần là lịch định kỳ. Khung giờ trống bên dưới được cập nhật riêng theo ngày.'),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final doctor = _doctor;
    final first = clinicDate(DateTime.now());
    final last = DateTime.parse(first)
        .add(const Duration(days: 365))
        .toIso8601String()
        .substring(0, 10);
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
        appBar: AppBar(title: const Text('Chi tiết bác sĩ')),
        body: RefreshIndicator(
          onRefresh: _confirming ? () async {} : _loadDoctor,
          child: ListView(
              padding: const EdgeInsets.all(20),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                if (_loadingDetail && doctor == null)
                  _skeleton('Đang tải thông tin bác sĩ')
                else if (_detailError != null)
                  AppErrorState(message: _detailError!, onRetry: _loadDoctor)
                else if (doctor != null) ...[
                  const Icon(Icons.medical_services_outlined, size: 48),
                  const SizedBox(height: 16),
                  Text(doctor.displayName,
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  if (_loadingSpecialty)
                    _skeleton('Đang tải chuyên khoa')
                  else if (_specialtyError != null)
                    AppErrorState(
                        message: _specialtyError!, onRetry: _loadSpecialty)
                  else
                    Text(
                        'Chuyên khoa: ${_specialtyName ?? 'Chưa có thông tin'}'),
                  const SizedBox(height: 16),
                  Text('Giới thiệu',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text(doctor.bio?.trim().isNotEmpty == true
                      ? doctor.bio!
                      : 'Bác sĩ chưa cập nhật giới thiệu chuyên môn.'),
                  if (!doctor.isActive)
                    const AppEmptyState(
                        title: 'Bác sĩ hiện không nhận lịch',
                        message: 'Quay lại danh sách để chọn bác sĩ khác.',
                        icon: Icons.event_busy_outlined)
                  else ...[
                    const SizedBox(height: 24),
                    Text('Lịch làm việc tuần',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    _weeklySchedule(),
                    const SizedBox(height: 24),
                    Text('Chọn khung giờ khám',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    const Text(
                        'Giờ Việt Nam (UTC+7). Khung giờ chỉ được xác nhận sau khi đặt lịch thành công.'),
                    const SizedBox(height: 12),
                    widget.bookingWidgets.dateStrip?.call(context, dateInput) ??
                        DoctorDateControl(input: dateInput),
                    if (_loadingSlots)
                      _skeleton('Đang tải khung giờ')
                    else if (_slotError != null)
                      AppErrorState(message: _slotError!, onRetry: _loadSlots)
                    else ...[
                      if (_slots.isEmpty)
                        Column(children: [
                          const AppEmptyState(
                              title: 'Chưa có khung giờ trống',
                              message: 'Hãy chọn ngày khác hoặc kiểm tra lại.',
                              icon: Icons.event_busy_outlined),
                          TextButton(
                              onPressed: _loadSlots,
                              child: const Text('Tải lại khung giờ')),
                        ]),
                      widget.bookingWidgets.slotSelector
                              ?.call(context, slotInput) ??
                          DoctorSlotControl(input: slotInput),
                    ],
                  ],
                ],
              ]),
        ),
      ),
    );
  }
}
