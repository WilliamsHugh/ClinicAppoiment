import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../../core/api/api_models.dart';
import '../../../core/api/clinic_api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/clinic_page_header.dart';
import '../../../shared/widgets/horizontal_date_strip.dart';
import '../../../shared/widgets/slot_grid_selector.dart';
import '../../doctors/doctor_models.dart';
import '../appointment_models.dart';
import '../data/appointment_repository.dart';

class AppointmentChangeResult {
  const AppointmentChangeResult(
      {this.appointment, this.requiresRefresh = false});
  final PatientAppointment? appointment;
  final bool requiresRefresh;
}

Future<AppointmentChangeResult?> showAppointmentChangeSheet(
  BuildContext context, {
  required PatientAppointment appointment,
  required AppointmentRepository repository,
  bool cancel = false,
}) =>
    showModalBottomSheet<AppointmentChangeResult>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        isDismissible: false,
        enableDrag: false,
        builder: (_) => RescheduleSheet(
            appointment: appointment, repository: repository, cancel: cancel));

/// Patient cancellation confirmation and slot-backed rescheduling.
class RescheduleSheet extends StatefulWidget {
  const RescheduleSheet(
      {required this.appointment,
      required this.repository,
      this.cancel = false,
      super.key});
  final PatientAppointment appointment;
  final AppointmentRepository repository;
  final bool cancel;
  @override
  State<RescheduleSheet> createState() => _RescheduleSheetState();
}

class _RescheduleSheetState extends State<RescheduleSheet> {
  final _reason = TextEditingController();
  final _scroll = ScrollController(keepScrollOffset: false);
  late String _date;
  List<DoctorSlot> _slots = const [];
  DoctorSlot? _selected;
  DoctorSlot? _unavailable;
  String? _slotError;
  String? _error;
  bool _loading = false;
  bool _busy = false;
  bool _review = false;
  bool _finished = false;
  int _request = 0;
  RequestCancellation? _cancellation;
  String? _fingerprint;
  String? _idempotencyKey;

  @override
  void initState() {
    super.initState();
    final today = DateTime.parse(clinicDate(DateTime.now()));
    final original = DateTime.parse(clinicDate(widget.appointment.startAt));
    final last = today.add(const Duration(days: 365));
    _date = (original.isBefore(today)
            ? today
            : original.isAfter(last)
                ? last
                : original)
        .toIso8601String()
        .substring(0, 10);
    if (!widget.cancel) _loadSlots();
  }

  @override
  void dispose() {
    _cancellation?.cancel();
    _reason.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _loadSlots() async {
    _cancellation?.cancel();
    final cancellation = _cancellation = RequestCancellation();
    final request = ++_request;
    setState(() {
      _loading = true;
      _slotError = null;
      _slots = const [];
      _selected = null;
    });
    try {
      final values = await widget.repository.rescheduleSlots(
          widget.appointment.doctorId, _date,
          cancellation: cancellation);
      if (!mounted || request != _request) return;
      setState(() => _slots = values
          .where((slot) =>
              !(slot.startAt == widget.appointment.startAt &&
                  slot.endAt == widget.appointment.endAt) &&
              !(_unavailable != null &&
                  slotKey(slot) == slotKey(_unavailable!)))
          .toList());
    } catch (error) {
      if (mounted && request == _request) {
        setState(() => _slotError = appointmentError(error));
      }
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  Future<void> _setDate(String date) async {
    if (_busy || _review || _finished) return;
    final parsed = DateTime.tryParse(date);
    final today = DateTime.parse(clinicDate(DateTime.now()));
    if (parsed == null ||
        parsed.toIso8601String().substring(0, 10) != date ||
        parsed.isBefore(today) ||
        parsed.isAfter(today.add(const Duration(days: 365)))) {
      return;
    }
    setState(() => _date = date);
    await _loadSlots();
  }

  String _formatDateDdMmYyyy(String isoDate) {
    final parts = isoDate.split('-');
    if (parts.length != 3) return isoDate;
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }

  Future<void> _chooseDate() async {
    final first = DateTime.parse(clinicDate(DateTime.now()));
    final parsed = DateTime.parse(_date);
    final chosen = await showDatePicker(
        context: context,
        initialDate: parsed.isBefore(first) ? first : parsed,
        firstDate: first,
        lastDate: first.add(const Duration(days: 365)),
        helpText: 'Chọn ngày khám mới (giờ Việt Nam)');
    if (chosen != null && mounted) {
      await _setDate(chosen.toIso8601String().substring(0, 10));
    }
  }

  void _close() =>
      Navigator.pop(context, AppointmentChangeResult(requiresRefresh: _review));

  Future<void> _submit() async {
    if (_busy || _review || _finished || !widget.appointment.canModify) return;
    if (!widget.cancel &&
        (_loading ||
            _selected == null ||
            !_slots.any((slot) => slotKey(slot) == slotKey(_selected!)))) {
      return;
    }
    FocusScope.of(context).unfocus();
    final fingerprint = widget.cancel
        ? jsonEncode(['cancel', widget.appointment.id, _reason.text.trim()])
        : jsonEncode([
            'reschedule',
            widget.appointment.id,
            _selected!.startAt.toUtc().toIso8601String(),
            _selected!.endAt.toUtc().toIso8601String(),
            _reason.text.trim()
          ]);
    if (_fingerprint != fingerprint) {
      _fingerprint = fingerprint;
      _idempotencyKey =
          'm-appt-${widget.cancel ? "cancel" : "resched"}-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(999999)}';
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final item = widget.cancel
          ? await widget.repository.cancel(widget.appointment.id,
              reason: _reason.text, idempotencyKey: _idempotencyKey)
          : await widget.repository.reschedule(
              widget.appointment.id, _selected!.startAt, _selected!.endAt,
              reason: _reason.text, idempotencyKey: _idempotencyKey);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _finished = true;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          Navigator.pop(
              context,
              AppointmentChangeResult(
                  appointment: item, requiresRefresh: true));
        }
      });
    } catch (error) {
      if (!mounted) return;
      final conflict = !widget.cancel &&
          error is ApiException &&
          {'APPOINTMENT_SLOT_UNAVAILABLE', 'APPOINTMENT_SLOT_INVALID'}
              .contains(error.code);
      setState(() {
        _busy = false;
        _error = appointmentError(error);
        if (conflict) {
          _unavailable = _selected;
          _selected = null;
        } else {
          _review = true;
        }
      });
      if (conflict) await _loadSlots();
    }
  }

  Widget _slotSkeleton() => Semantics(
        label: 'Đang tải khung giờ',
        liveRegion: true,
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: List.generate(
            6,
            (_) => Container(
              width: 108,
              height: 48,
              decoration: BoxDecoration(
                color: ClinicColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: ClinicColors.border),
              ),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final appointment = widget.appointment;
    final enabled = !_busy && !_review && !_finished;
    final todayDate = DateTime.parse(clinicDate(DateTime.now()));
    final selectedDate = DateTime.parse(_date);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_busy) _close();
      },
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height,
        child: Scaffold(
          backgroundColor: ClinicColors.scaffold,
          resizeToAvoidBottomInset: false,
          body: Column(
            children: [
              ClinicPageHeader(
                title: widget.cancel ? 'Hủy lịch hẹn?' : 'Đổi lịch hẹn',
                subtitle: widget.cancel
                    ? 'Xác nhận hủy lịch hẹn'
                    : 'Chọn ngày và khung giờ khám mới',
                trailing: IconButton(
                  tooltip: 'Đóng',
                  style: IconButton.styleFrom(
                    foregroundColor: Colors.white,
                    disabledForegroundColor: Colors.white54,
                  ),
                  onPressed: _busy ? null : _close,
                  icon: const Icon(Icons.close),
                ),
              ),
              Expanded(
                child: SafeArea(
                  top: false,
                  child: ListView(
                    primary: false,
                    controller: _scroll,
                    padding: EdgeInsets.fromLTRB(0, 16, 0, 20 + bottomInset),
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: ClinicColors.card,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: ClinicColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                appointment.doctorName,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(
                                      fontWeight: FontWeight.w700,
                                      color: ClinicColors.ink,
                                    ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Lịch hiện tại: ${appointment.displayDate}, ${appointment.displayTime} (giờ Việt Nam)',
                                style: const TextStyle(
                                  fontSize: 14,
                                  color: ClinicColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (widget.cancel)
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: ClinicColors.warningLight,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: ClinicColors.warning
                                    .withValues(alpha: 0.35),
                              ),
                            ),
                            child: const Text(
                              'Bạn có chắc muốn hủy lịch hẹn này? Hãy kiểm tra thông tin trước khi xác nhận.',
                              style: TextStyle(
                                fontSize: 14,
                                color: ClinicColors.warningDark,
                              ),
                            ),
                          ),
                        )
                      else ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Ngày khám mới',
                                      style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                        color: ClinicColors.ink,
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      'Đã chọn: ${_formatDateDdMmYyyy(_date)} (giờ Việt Nam)',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        color: ClinicColors.muted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              TextButton.icon(
                                onPressed: enabled ? _chooseDate : null,
                                style: TextButton.styleFrom(
                                  minimumSize: const Size(0, 48),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                icon: const Icon(Icons.calendar_month_outlined,
                                    size: 18),
                                label: const Text('Chọn ngày khác'),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        IgnorePointer(
                          ignoring: !enabled,
                          child: Opacity(
                            opacity: enabled ? 1.0 : 0.6,
                            child: MediaQuery.withClampedTextScaling(
                              maxScaleFactor: 1.35,
                              child: HorizontalDateStrip(
                                startDate: todayDate,
                                selectedDate: selectedDate,
                                daysCount: 30,
                                onDateSelected: (date) {
                                  final iso =
                                      '${date.year.toString().padLeft(4, '0')}-'
                                      '${date.month.toString().padLeft(2, '0')}-'
                                      '${date.day.toString().padLeft(2, '0')}';
                                  _setDate(iso);
                                },
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Khung giờ trống (giờ Việt Nam)',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: ClinicColors.ink,
                                ),
                              ),
                              const SizedBox(height: 10),
                              if (_loading)
                                _slotSkeleton()
                              else if (_slotError != null)
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: ClinicColors.dangerLight,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: ClinicColors.danger
                                          .withValues(alpha: 0.35),
                                    ),
                                  ),
                                  child: Column(
                                    children: [
                                      Text(
                                        _slotError!,
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                          color: ClinicColors.dangerDark,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      OutlinedButton(
                                        onPressed: enabled ? _loadSlots : null,
                                        style: OutlinedButton.styleFrom(
                                          minimumSize: const Size(0, 48),
                                          foregroundColor:
                                              ClinicColors.dangerDark,
                                          shape: RoundedRectangleBorder(
                                            borderRadius:
                                                BorderRadius.circular(12),
                                          ),
                                        ),
                                        child: const Text('Thử lại khung giờ'),
                                      ),
                                    ],
                                  ),
                                )
                              else if (_slots.isEmpty)
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: ClinicColors.card,
                                    borderRadius: BorderRadius.circular(12),
                                    border:
                                        Border.all(color: ClinicColors.border),
                                  ),
                                  child: const Text(
                                    'Ngày này chưa có khung giờ trống khác. Hãy chọn ngày khác.',
                                    style: TextStyle(
                                      fontSize: 14,
                                      color: ClinicColors.muted,
                                    ),
                                  ),
                                )
                              else
                                IgnorePointer(
                                  ignoring: !enabled,
                                  child: Opacity(
                                    opacity: enabled ? 1.0 : 0.6,
                                    child: SlotGridSelector(
                                      slots: _slots
                                          .map((slot) => SlotOption(
                                                startAt: slot.startAt,
                                                endAt: slot.endAt,
                                              ))
                                          .toList(growable: false),
                                      selectedSlot: _selected == null
                                          ? null
                                          : SlotOption(
                                              startAt: _selected!.startAt,
                                              endAt: _selected!.endAt,
                                            ),
                                      onSlotSelected: (option) {
                                        setState(() {
                                          _selected = DoctorSlot(
                                            startAt: option.startAt,
                                            endAt: option.endAt,
                                          );
                                        });
                                      },
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: TextField(
                          controller: _reason,
                          enabled: enabled,
                          maxLength: 500,
                          minLines: 2,
                          maxLines: 4,
                          decoration: const InputDecoration(
                            labelText: 'Lý do (không bắt buộc)',
                            border: OutlineInputBorder(),
                          ),
                        ),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 10),
                          child: Semantics(
                            liveRegion: true,
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: ClinicColors.dangerLight,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color:
                                      ClinicColors.danger.withValues(alpha: 0.35),
                                ),
                              ),
                              child: Text(
                                _error!,
                                style: const TextStyle(
                                  color: ClinicColors.dangerDark,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                        ),
                      const SizedBox(height: 12),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_review)
                              FilledButton(
                                onPressed: _close,
                                style: FilledButton.styleFrom(
                                  minimumSize: const Size(0, 48),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: const Text(
                                    'Đóng và kiểm tra lại danh sách'),
                              )
                            else
                              FilledButton(
                                onPressed: enabled &&
                                        (widget.cancel ||
                                            (!_loading &&
                                                _slotError == null &&
                                                _selected != null))
                                    ? _submit
                                    : null,
                                style: FilledButton.styleFrom(
                                  backgroundColor: widget.cancel
                                      ? ClinicColors.danger
                                      : ClinicColors.primary,
                                  foregroundColor: Colors.white,
                                  minimumSize: const Size(0, 48),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: Text(_busy
                                    ? 'Đang lưu…'
                                    : widget.cancel
                                        ? 'Xác nhận hủy lịch'
                                        : 'Xác nhận đổi lịch'),
                              ),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: _busy ? null : _close,
                              style: TextButton.styleFrom(
                                minimumSize: const Size(0, 48),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: const Text('Quay lại'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  ),
);
  }
}
