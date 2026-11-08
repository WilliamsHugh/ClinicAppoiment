import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../doctors/doctor_models.dart';
import 'booking_selection.dart';
import 'data/appointment_repository.dart';

/// Returns the final selection only after the Gateway confirms creation.
Future<BookingSelection?> showBookingConfirmationSheet(
  BuildContext context, {
  required BookingSelection selection,
  required ClinicApiClient api,
}) =>
    showModalBottomSheet<BookingSelection>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => BookingConfirmationSheet(selection: selection, api: api),
    );

class BookingConfirmationSheet extends StatefulWidget {
  const BookingConfirmationSheet({
    required this.selection,
    required this.api,
    super.key,
  });

  final BookingSelection selection;
  final ClinicApiClient api;

  @override
  State<BookingConfirmationSheet> createState() =>
      _BookingConfirmationSheetState();
}

class _BookingConfirmationSheetState extends State<BookingConfirmationSheet> {
  final _reason = TextEditingController();
  final _random = Random.secure();
  late final AppointmentRepository _repository;
  late BookingSelection _selection;
  late String _slotDate;
  DoctorSlot? _unavailableSlot;
  List<DoctorSlot> _slots = const [];
  bool _submitting = false;
  bool _selectingReplacement = false;
  bool _loadingSlots = false;
  bool _hasReplacement = false;
  String? _error;
  String? _slotError;
  String? _fingerprint;
  String? _idempotencyKey;

  @override
  void initState() {
    super.initState();
    _selection = widget.selection;
    _slotDate = clinicDate(_selection.startAt);
    _repository = AppointmentRepository(widget.api);
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting || (_selectingReplacement && !_hasReplacement)) return;
    FocusScope.of(context).unfocus();
    // A retry of the same payload must use the same key, including after timeout.
    final fingerprint = jsonEncode([
      _selection.doctorId,
      _selection.specialtyId,
      _selection.startAt.toUtc().toIso8601String(),
      _selection.endAt.toUtc().toIso8601String(),
      _reason.text.trim(),
    ]);
    if (_fingerprint != fingerprint) {
      _fingerprint = fingerprint;
      _idempotencyKey = 'booking-${DateTime.now().microsecondsSinceEpoch}-'
          '${List.generate(16, (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await _repository.create(_selection,
          reason: _reason.text, idempotencyKey: _idempotencyKey!);
      if (!mounted) return;
      // PopScope must be rebuilt before completing a guarded modal route.
      setState(() => _submitting = false);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.of(context).pop(_selection);
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      final slotUnavailable = error.code == 'APPOINTMENT_SLOT_UNAVAILABLE' ||
          error.code == 'APPOINTMENT_SLOT_INVALID';
      setState(() {
        _submitting = false;
        _error = slotUnavailable
            ? 'Khung giờ này không còn khả dụng. Vui lòng chọn giờ khác; lý do khám đã được giữ lại.'
            : _friendlyError(error);
        if (slotUnavailable) {
          _selectingReplacement = true;
          _hasReplacement = false;
          _slots = const [];
          _slotDate = clinicDate(_selection.startAt);
          _unavailableSlot =
              DoctorSlot(startAt: _selection.startAt, endAt: _selection.endAt);
        }
      });
      if (slotUnavailable) await _loadSlots();
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Chưa thể xác nhận đặt lịch. Vui lòng thử lại.';
        });
      }
    }
  }

  String _friendlyError(ApiException error) => switch (error.code) {
        'REQUEST_TIMEOUT' ||
        'NETWORK_ERROR' =>
          'Chưa nhận được xác nhận từ máy chủ. Kiểm tra kết nối và bấm xác nhận để thử lại.',
        'SESSION_REQUIRED' ||
        'AUTH_TOKEN_INVALID' =>
          'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        _ => error.statusCode == 403
            ? 'Bạn không có quyền đặt lịch này.'
            : 'Không thể đặt lịch lúc này. Vui lòng thử lại.',
      };

  Future<void> _loadSlots() async {
    setState(() {
      _loadingSlots = true;
      _slotError = null;
      _hasReplacement = false;
    });
    try {
      final slots =
          await _repository.availableSlots(_selection.doctorId, _slotDate);
      if (mounted) {
        setState(() => _slots = slots
            .where((slot) =>
                slot.startAt.isAfter(DateTime.now().toUtc()) &&
                !(slot.startAt == _unavailableSlot?.startAt &&
                    slot.endAt == _unavailableSlot?.endAt))
            .toList(growable: false));
      }
    } catch (_) {
      if (mounted) {
        setState(() =>
            _slotError = 'Không thể tải khung giờ trống. Vui lòng thử lại.');
      }
    } finally {
      if (mounted) setState(() => _loadingSlots = false);
    }
  }

  Future<void> _chooseDate() async {
    final today = DateTime.parse(clinicDate(DateTime.now()));
    final selected = DateTime.parse(_slotDate);
    final lastDate = today.add(const Duration(days: 365));
    final date = await showDatePicker(
        context: context,
        initialDate: selected.isBefore(today)
            ? today
            : selected.isAfter(lastDate)
                ? lastDate
                : selected,
        firstDate: today,
        lastDate: lastDate);
    if (date == null || !mounted) return;
    setState(() {
      _slotDate =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      _slots = const [];
      _hasReplacement = false;
    });
    await _loadSlots();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final canSubmit = !_submitting &&
        !_loadingSlots &&
        (!_selectingReplacement || _hasReplacement);
    return PopScope(
      canPop: !_submitting,
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height,
        child: Scaffold(
          appBar: AppBar(
            automaticallyImplyLeading: false,
            title: const Text('Xác nhận đặt lịch'),
            actions: [
              IconButton(
                  tooltip: 'Đóng',
                  onPressed: _submitting ? null : () => Navigator.pop(context),
                  icon: const Icon(Icons.close))
            ],
          ),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Icon(Icons.event_available_outlined, size: 48),
                const SizedBox(height: 16),
                Text(_selection.doctorName,
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text('Ngày khám: $_slotDate'),
                if (!_selectingReplacement || _hasReplacement)
                  Text(
                      'Giờ khám: ${clinicTime(_selection.startAt)}–${clinicTime(_selection.endAt)} (giờ Việt Nam)'),
                const SizedBox(height: 12),
                const Text(
                    'Khung giờ chỉ được xác nhận sau khi đặt lịch thành công.'),
                const SizedBox(height: 20),
                TextField(
                  controller: _reason,
                  enabled: !_submitting,
                  minLines: 3,
                  maxLines: 5,
                  maxLength: 500,
                  decoration: const InputDecoration(
                      labelText: 'Lý do khám (không bắt buộc)',
                      hintText: 'Mô tả ngắn vấn đề bạn muốn được tư vấn',
                      border: OutlineInputBorder()),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Semantics(
                        liveRegion: true,
                        child: Text(_error!,
                            style: TextStyle(color: colors.error))),
                  ),
                if (_selectingReplacement) ...[
                  OutlinedButton.icon(
                      onPressed:
                          _submitting || _loadingSlots ? null : _chooseDate,
                      icon: const Icon(Icons.calendar_month),
                      label: const Text('Chọn ngày khác')),
                  if (_loadingSlots)
                    Semantics(
                        label: 'Đang tải khung giờ trống',
                        liveRegion: true,
                        child: Column(
                            children: List.generate(
                                3,
                                (_) => Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 6),
                                      child: Container(
                                          height: 36,
                                          color:
                                              colors.surfaceContainerHighest),
                                    )))),
                  if (_slotError != null) ...[
                    Text(_slotError!),
                    TextButton(
                        onPressed: _loadSlots, child: const Text('Thử lại')),
                  ] else if (!_loadingSlots && _slots.isEmpty) ...[
                    const Icon(Icons.event_busy_outlined, size: 40),
                    const Text(
                        'Ngày này đã hết khung giờ trống. Hãy chọn ngày khác hoặc tải lại.'),
                    TextButton(
                        onPressed: _loadSlots,
                        child: const Text('Tải lại khung giờ')),
                  ] else if (!_loadingSlots)
                    Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _slots
                            .map((slot) => ChoiceChip(
                                  label: Text(
                                      '${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)}'),
                                  selected: _hasReplacement &&
                                      _selection.startAt == slot.startAt,
                                  onSelected: _submitting
                                      ? null
                                      : (_) => setState(() {
                                            _selection = BookingSelection(
                                                doctorId: _selection.doctorId,
                                                doctorName:
                                                    _selection.doctorName,
                                                specialtyId:
                                                    _selection.specialtyId,
                                                startAt: slot.startAt,
                                                endAt: slot.endAt);
                                            _hasReplacement = true;
                                          }),
                                ))
                            .toList()),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: canSubmit ? _submit : null,
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.check),
                  label: Text(
                      _submitting ? 'Đang đặt lịch…' : 'Xác nhận đặt lịch'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
