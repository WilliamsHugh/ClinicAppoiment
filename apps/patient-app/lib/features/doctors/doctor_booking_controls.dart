import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../shared/widgets/horizontal_date_strip.dart';
import '../../shared/widgets/slot_grid_selector.dart';
import 'doctor_models.dart';

/// Consumer inputs for TV1's date/slot widgets; contains no API or booking logic.
class DoctorDateInput {
  const DoctorDateInput(
      {required this.selectedDate,
      required this.firstDate,
      required this.lastDate,
      required this.onChanged,
      required this.onOpenCalendar,
      required this.enabled});
  final String selectedDate;
  final String firstDate;
  final String lastDate;
  final ValueChanged<String> onChanged;
  final VoidCallback onOpenCalendar;
  final bool enabled;
}

class DoctorSlotInput {
  const DoctorSlotInput(
      {required this.slots,
      required this.unavailableKeys,
      required this.onSelected,
      required this.enabled});
  final List<DoctorSlot> slots;
  final Set<String> unavailableKeys;
  final ValueChanged<DoctorSlot> onSelected;
  final bool enabled;
}

class DoctorBookingWidgets {
  const DoctorBookingWidgets({this.dateStrip, this.slotSelector});
  final Widget Function(BuildContext, DoctorDateInput)? dateStrip;
  final Widget Function(BuildContext, DoctorSlotInput)? slotSelector;
}

/// Date control combining quick day navigation, full calendar picker, and
/// [HorizontalDateStrip] synced to clinic dates.
class DoctorDateControl extends StatelessWidget {
  const DoctorDateControl({required this.input, super.key});
  final DoctorDateInput input;

  @override
  Widget build(BuildContext context) {
    void shift(int days) {
      input.onChanged(addClinicDays(input.selectedDate, days));
    }

    final nowUtc = DateTime.now().toUtc();
    final fallbackFirstUtc = DateTime.utc(nowUtc.year, nowUtc.month, nowUtc.day);
    final firstUtc =
        tryParseClinicDateUtc(input.firstDate) ?? fallbackFirstUtc;
    final lastUtc = tryParseClinicDateUtc(input.lastDate) ??
        DateTime.utc(firstUtc.year, firstUtc.month, firstUtc.day + 13);
    final selectedUtc = tryParseClinicDateUtc(input.selectedDate) ?? firstUtc;

    final totalDays = math.max(1, lastUtc.difference(firstUtc).inDays + 1);
    final offset = selectedUtc.difference(firstUtc).inDays;
    final startOffset = offset >= 14
        ? math.min(offset, math.max(0, totalDays - 4))
        : 0;
    final daysCount = math.min(14, math.max(1, totalDays - startOffset));
    final stripStartUtc = DateTime.utc(
      firstUtc.year,
      firstUtc.month,
      firstUtc.day + startOffset,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            IconButton(
              tooltip: 'Ngày trước',
              onPressed: input.enabled &&
                      input.selectedDate.compareTo(input.firstDate) > 0
                  ? () => shift(-1)
                  : null,
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 10,
                  ),
                ),
                onPressed: input.enabled ? input.onOpenCalendar : null,
                icon: const Icon(Icons.calendar_month, size: 18),
                label: Text(
                  'Ngày khám: ${input.selectedDate}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
            IconButton(
              tooltip: 'Ngày tiếp theo',
              onPressed: input.enabled &&
                      input.selectedDate.compareTo(input.lastDate) < 0
                  ? () => shift(1)
                  : null,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        const SizedBox(height: 12),
        IgnorePointer(
          ignoring: !input.enabled,
          child: Opacity(
            opacity: input.enabled ? 1.0 : 0.55,
            child: MediaQuery.withClampedTextScaling(
              maxScaleFactor: 1.3,
              child: _SyncedHorizontalDateStrip(
                stripStartUtc: stripStartUtc,
                selectedUtc: selectedUtc,
                daysCount: daysCount,
                onDateSelected: (date) =>
                    input.onChanged(formatClinicDate(date)),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SyncedHorizontalDateStrip extends StatefulWidget {
  const _SyncedHorizontalDateStrip({
    required this.stripStartUtc,
    required this.selectedUtc,
    required this.daysCount,
    required this.onDateSelected,
  });

  final DateTime stripStartUtc;
  final DateTime selectedUtc;
  final int daysCount;
  final ValueChanged<DateTime> onDateSelected;

  @override
  State<_SyncedHorizontalDateStrip> createState() =>
      _SyncedHorizontalDateStripState();
}

class _SyncedHorizontalDateStripState
    extends State<_SyncedHorizontalDateStrip> {
  static const double _tileWidth = 58.0;
  static const double _tileSeparator = 8.0;
  static const double _horizontalPadding = 16.0;

  final GlobalKey _stripKey = GlobalKey();
  DateTime? _lastStripTappedDate;
  bool _syncScheduled = false;
  int _pendingAttempts = 0;

  @override
  void initState() {
    super.initState();
    final initialIndex =
        widget.selectedUtc.difference(widget.stripStartUtc).inDays;
    if (initialIndex > 0 && initialIndex < widget.daysCount) {
      _scheduleEnsureSelectedVisible();
    }
  }

  @override
  void didUpdateWidget(covariant _SyncedHorizontalDateStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    final selectedChanged = widget.selectedUtc != oldWidget.selectedUtc;
    final windowChanged = widget.stripStartUtc != oldWidget.stripStartUtc ||
        widget.daysCount != oldWidget.daysCount;
    final isFromStripTap = _lastStripTappedDate != null &&
        _lastStripTappedDate == widget.selectedUtc &&
        widget.stripStartUtc == oldWidget.stripStartUtc;
    _lastStripTappedDate = null;

    if ((selectedChanged || windowChanged) && !isFromStripTap) {
      _scheduleEnsureSelectedVisible();
    }
  }

  void _scheduleEnsureSelectedVisible({int attempts = 3}) {
    _pendingAttempts = math.max(_pendingAttempts, attempts);
    if (_syncScheduled) return;
    _syncScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final remainingAttempts = _pendingAttempts;
      _pendingAttempts = 0;
      _syncScheduled = false;
      if (!mounted) return;
      _ensureSelectedVisible(remainingAttempts);
    });
  }

  ScrollableState? _findScrollableState(BuildContext rootContext) {
    ScrollableState? found;
    void visit(Element element) {
      if (found != null) return;
      if (element is StatefulElement && element.state is ScrollableState) {
        found = element.state as ScrollableState;
        return;
      }
      element.visitChildElements(visit);
    }

    rootContext.visitChildElements(visit);
    return found;
  }

  void _ensureSelectedVisible(int remainingAttempts) {
    final stripContext = _stripKey.currentContext;
    if (stripContext == null) return;
    final scrollable = _findScrollableState(stripContext);
    if (scrollable == null) return;
    final position = scrollable.position;
    if (!position.hasPixels || !position.hasViewportDimension) return;
    final maxExtent = position.maxScrollExtent;
    if (!maxExtent.isFinite || maxExtent < 0) return;

    final index = widget.selectedUtc.difference(widget.stripStartUtc).inDays;
    if (index < 0 || index >= widget.daysCount) return;

    final tileLeft =
        _horizontalPadding + index * (_tileWidth + _tileSeparator);
    final tileRight = tileLeft + _tileWidth;
    final pixels = position.pixels;
    final viewport = position.viewportDimension;

    double? target;
    if (tileLeft < pixels) {
      target = (tileLeft - _horizontalPadding).clamp(0.0, maxExtent);
    } else if (tileRight > pixels + viewport) {
      target =
          (tileRight + _horizontalPadding - viewport).clamp(0.0, maxExtent);
    }

    if (target != null && target != pixels) {
      position.jumpTo(target);
      if (remainingAttempts > 1) {
        _scheduleEnsureSelectedVisible(attempts: remainingAttempts - 1);
      }
    }
  }

  void _handleStripTap(DateTime date) {
    final tappedUtc = DateTime.utc(date.year, date.month, date.day);
    _lastStripTappedDate = tappedUtc;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _lastStripTappedDate == tappedUtc) {
        _lastStripTappedDate = null;
      }
    });
    widget.onDateSelected(date);
  }

  @override
  Widget build(BuildContext context) {
    return HorizontalDateStrip(
      key: _stripKey,
      startDate: DateTime(
        widget.stripStartUtc.year,
        widget.stripStartUtc.month,
        widget.stripStartUtc.day,
      ),
      selectedDate: DateTime(
        widget.selectedUtc.year,
        widget.selectedUtc.month,
        widget.selectedUtc.day,
      ),
      daysCount: widget.daysCount,
      onDateSelected: _handleStripTap,
    );
  }
}

/// Slot selector backed by [SlotGridSelector] (UTC+7 display, UTC callback).
class DoctorSlotControl extends StatelessWidget {
  const DoctorSlotControl({required this.input, super.key});
  final DoctorSlotInput input;

  @override
  Widget build(BuildContext context) {
    if (input.slots.isEmpty) {
      return const SizedBox.shrink();
    }

    final options = input.slots
        .map((slot) => SlotOption(
              startAt: slot.startAt,
              endAt: slot.endAt,
              isAvailable:
                  input.enabled && !input.unavailableKeys.contains(slotKey(slot)),
            ))
        .toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 16,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _SlotLegendItem(
              color: ClinicColors.card,
              borderColor: ClinicColors.primary.withValues(alpha: 0.45),
              label: 'Còn trống',
            ),
            const _SlotLegendItem(
              color: ClinicColors.surfaceSubtle,
              borderColor: ClinicColors.border,
              label: 'Không còn khả dụng',
              crossedOut: true,
            ),
          ],
        ),
        if (input.unavailableKeys.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: ClinicColors.surfaceSubtle,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: ClinicColors.border),
            ),
            child: const Text(
              'Các khung giờ gạch ngang đã được đặt hoặc không còn khả dụng.',
              style: TextStyle(fontSize: 12.5, color: ClinicColors.muted),
            ),
          ),
        ],
        const SizedBox(height: 12),
        SlotGridSelector(
          slots: options,
          selectedSlot: null,
          onSlotSelected: (option) {
            final matched = input.slots.where((slot) =>
                slot.startAt.toUtc() == option.startAt.toUtc() &&
                slot.endAt.toUtc() == option.endAt.toUtc());
            if (matched.isNotEmpty) {
              input.onSelected(matched.first);
            }
          },
        ),
      ],
    );
  }
}

class _SlotLegendItem extends StatelessWidget {
  const _SlotLegendItem({
    required this.color,
    required this.borderColor,
    required this.label,
    this.crossedOut = false,
  });

  final Color color;
  final Color borderColor;
  final String label;
  final bool crossedOut;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: borderColor),
          ),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              color: crossedOut ? ClinicColors.mutedLight : ClinicColors.muted,
              decoration: crossedOut ? TextDecoration.lineThrough : null,
            ),
          ),
        ),
      ],
    );
  }
}
