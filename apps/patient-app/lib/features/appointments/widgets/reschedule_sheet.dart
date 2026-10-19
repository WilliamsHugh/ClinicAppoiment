import 'package:flutter/material.dart';

import '../../../core/api/api_models.dart';
import '../../../core/api/clinic_api_client.dart';
import '../../doctors/doctor_booking_controls.dart';
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
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final item = widget.cancel
          ? await widget.repository
              .cancel(widget.appointment.id, reason: _reason.text)
          : await widget.repository.reschedule(
              widget.appointment.id, _selected!.startAt, _selected!.endAt,
              reason: _reason.text);
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

  @override
  Widget build(BuildContext context) {
    final appointment = widget.appointment;
    final enabled = !_busy && !_review && !_finished;
    final first = clinicDate(DateTime.now());
    final last = DateTime.parse(first)
        .add(const Duration(days: 365))
        .toIso8601String()
        .substring(0, 10);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_busy) _close();
      },
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height,
        child: Scaffold(
          appBar: AppBar(
              automaticallyImplyLeading: false,
              title: Text(widget.cancel ? 'Hủy lịch hẹn?' : 'Đổi lịch hẹn'),
              actions: [
                IconButton(
                    tooltip: 'Đóng',
                    onPressed: _busy ? null : _close,
                    icon: const Icon(Icons.close)),
              ]),
          body: SafeArea(
              child: ListView(
                  primary: false,
                  controller: _scroll,
                  padding: const EdgeInsets.all(20),
                  children: [
                Text(appointment.doctorName,
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(
                    'Lịch hiện tại: ${appointment.displayDate}, ${appointment.displayTime} (giờ Việt Nam)'),
                const SizedBox(height: 16),
                if (widget.cancel)
                  const Text(
                      'Bạn có chắc muốn hủy lịch hẹn này? Hãy kiểm tra thông tin trước khi xác nhận.')
                else ...[
                  DoctorDateControl(
                      input: DoctorDateInput(
                          selectedDate: _date,
                          firstDate: first,
                          lastDate: last,
                          onChanged: _setDate,
                          onOpenCalendar: _chooseDate,
                          enabled: enabled)),
                  const SizedBox(height: 12),
                  if (_loading)
                    Semantics(
                        label: 'Đang tải khung giờ',
                        liveRegion: true,
                        child: Column(
                            children: List.generate(
                                3,
                                (_) => Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 5),
                                      child: Container(
                                          height: 36,
                                          color: Theme.of(context)
                                              .colorScheme
                                              .surfaceContainerHighest),
                                    ))))
                  else if (_slotError != null)
                    Column(children: [
                      Text(_slotError!),
                      TextButton(
                          onPressed: enabled ? _loadSlots : null,
                          child: const Text('Thử lại khung giờ'))
                    ])
                  else if (_slots.isEmpty)
                    const Text(
                        'Ngày này chưa có khung giờ trống khác. Hãy chọn ngày khác.')
                  else
                    InputDecorator(
                        decoration:
                            const InputDecoration(labelText: 'Khung giờ trống'),
                        child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                          value: _selected == null ? null : slotKey(_selected!),
                          isExpanded: true,
                          hint: const Text('Chọn khung giờ'),
                          items: _slots
                              .map((slot) => DropdownMenuItem(
                                  value: slotKey(slot),
                                  child: Text(
                                      '${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)}')))
                              .toList(),
                          onChanged: enabled
                              ? (value) => setState(() => _selected = _slots
                                  .firstWhere((slot) => slotKey(slot) == value))
                              : null,
                        ))),
                ],
                const SizedBox(height: 20),
                TextField(
                    controller: _reason,
                    enabled: enabled,
                    maxLength: 500,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                        labelText: 'Lý do (không bắt buộc)',
                        border: OutlineInputBorder())),
                if (_error != null)
                  Semantics(
                      liveRegion: true,
                      child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Text(_error!,
                              style: TextStyle(
                                  color:
                                      Theme.of(context).colorScheme.error)))),
                if (_review)
                  FilledButton(
                      onPressed: _close,
                      child: const Text('Đóng và kiểm tra lại danh sách'))
                else
                  FilledButton(
                      onPressed: enabled &&
                              (widget.cancel ||
                                  (!_loading &&
                                      _slotError == null &&
                                      _selected != null))
                          ? _submit
                          : null,
                      style: widget.cancel
                          ? FilledButton.styleFrom(
                              backgroundColor:
                                  Theme.of(context).colorScheme.error)
                          : null,
                      child: Text(_busy
                          ? 'Đang lưu…'
                          : widget.cancel
                              ? 'Xác nhận hủy lịch'
                              : 'Xác nhận đổi lịch')),
                TextButton(
                    onPressed: _busy ? null : _close,
                    child: const Text('Quay lại')),
              ])),
        ),
      ),
    );
  }
}
