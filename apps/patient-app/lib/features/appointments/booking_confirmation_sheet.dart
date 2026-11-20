import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/clinic_page_header.dart';
import '../../shared/widgets/slot_grid_selector.dart';
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
    final canSubmit = !_submitting &&
        !_loadingSlots &&
        (!_selectingReplacement || _hasReplacement);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return PopScope(
      canPop: !_submitting,
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height,
        child: Scaffold(
          backgroundColor: ClinicColors.scaffold,
          resizeToAvoidBottomInset: false,
          body: Column(
            children: [
              ClinicPageHeader(
                title: 'Xác nhận đặt lịch',
                subtitle: 'Kiểm tra thông tin trước khi xác nhận',
                trailing: IconButton(
                  tooltip: 'Đóng',
                  style: IconButton.styleFrom(
                    foregroundColor: Colors.white,
                    disabledForegroundColor: Colors.white54,
                  ),
                  onPressed: _submitting ? null : () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ),
              Expanded(
                child: SafeArea(
                  top: false,
                  child: SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottomInset),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: ClinicColors.card,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: ClinicColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: ClinicColors.primarySoft,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: const Icon(
                                      Icons.event_available_outlined,
                                      size: 24,
                                      color: ClinicColors.primary,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _selection.doctorName,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleLarge
                                              ?.copyWith(
                                                fontWeight: FontWeight.w700,
                                                color: ClinicColors.ink,
                                              ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Ngày khám: $_slotDate',
                                          style: const TextStyle(
                                            fontSize: 14,
                                            color: ClinicColors.ink,
                                          ),
                                        ),
                                        if (!_selectingReplacement ||
                                            _hasReplacement) ...[
                                          const SizedBox(height: 2),
                                          Text(
                                            'Giờ khám: ${clinicTime(_selection.startAt)}–${clinicTime(_selection.endAt)} (giờ Việt Nam)',
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w600,
                                              color: ClinicColors.primary,
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 8),
                                decoration: BoxDecoration(
                                  color: ClinicColors.primarySoft,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: const Text(
                                  'Khung giờ chỉ được xác nhận sau khi đặt lịch thành công.',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: ClinicColors.primaryDark,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _reason,
                          enabled: !_submitting,
                          minLines: 3,
                          maxLines: 5,
                          maxLength: 500,
                          decoration: const InputDecoration(
                            labelText: 'Lý do khám (không bắt buộc)',
                            hintText: 'Mô tả ngắn vấn đề bạn muốn được tư vấn',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Semantics(
                              liveRegion: true,
                              child: Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: ClinicColors.dangerLight,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: ClinicColors.danger
                                        .withValues(alpha: 0.35),
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
                        if (_selectingReplacement) ...[
                          const SizedBox(height: 8),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: OutlinedButton.icon(
                              onPressed: _submitting || _loadingSlots
                                  ? null
                                  : _chooseDate,
                              style: OutlinedButton.styleFrom(
                                minimumSize: const Size(0, 48),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              icon: const Icon(Icons.calendar_month),
                              label: const Text('Chọn ngày khác'),
                            ),
                          ),
                          const SizedBox(height: 10),
                          if (_loadingSlots)
                            Semantics(
                              label: 'Đang tải khung giờ trống',
                              liveRegion: true,
                              child: Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: List.generate(
                                  4,
                                  (_) => Container(
                                    width: 108,
                                    height: 48,
                                    decoration: BoxDecoration(
                                      color: ClinicColors.surfaceSubtle,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                          color: ClinicColors.border),
                                    ),
                                  ),
                                ),
                              ),
                            )
                          else if (_slotError != null) ...[
                            Text(
                              _slotError!,
                              style:
                                  const TextStyle(color: ClinicColors.danger),
                            ),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: _loadSlots,
                                style: TextButton.styleFrom(
                                  minimumSize: const Size(0, 48),
                                ),
                                child: const Text('Thử lại'),
                              ),
                            ),
                          ] else if (_slots.isEmpty) ...[
                            const SizedBox(height: 4),
                            const Icon(Icons.event_busy_outlined,
                                size: 40, color: ClinicColors.muted),
                            const SizedBox(height: 8),
                            const Text(
                              'Ngày này đã hết khung giờ trống. Hãy chọn ngày khác hoặc tải lại.',
                              style: TextStyle(color: ClinicColors.muted),
                            ),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: _loadSlots,
                                style: TextButton.styleFrom(
                                  minimumSize: const Size(0, 48),
                                ),
                                child: const Text('Tải lại khung giờ'),
                              ),
                            ),
                          ] else
                            IgnorePointer(
                              ignoring: _submitting,
                              child: Opacity(
                                opacity: _submitting ? 0.6 : 1.0,
                                child: SlotGridSelector(
                                  slots: _slots
                                      .map((slot) => SlotOption(
                                            startAt: slot.startAt,
                                            endAt: slot.endAt,
                                          ))
                                      .toList(growable: false),
                                  selectedSlot: _hasReplacement
                                      ? SlotOption(
                                          startAt: _selection.startAt,
                                          endAt: _selection.endAt,
                                        )
                                      : null,
                                  onSlotSelected: (option) {
                                    setState(() {
                                      _selection = BookingSelection(
                                        doctorId: _selection.doctorId,
                                        doctorName: _selection.doctorName,
                                        specialtyId: _selection.specialtyId,
                                        startAt: option.startAt,
                                        endAt: option.endAt,
                                      );
                                      _hasReplacement = true;
                                    });
                                  },
                                ),
                              ),
                            ),
                        ],
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: canSubmit ? _submit : null,
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 48),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          icon: _submitting
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.check),
                          label: Text(_submitting
                              ? 'Đang đặt lịch…'
                              : 'Xác nhận đặt lịch'),
                        ),
                      ],
                    ),
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
