import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

DateTime _toClinicVnTime(DateTime value) =>
    value.toUtc().add(const Duration(hours: 7));

class SlotOption {
  const SlotOption({
    required this.startAt,
    required this.endAt,
    this.isAvailable = true,
  });

  final DateTime startAt;
  final DateTime endAt;
  final bool isAvailable;

  DateTime get clinicStartAt => _toClinicVnTime(startAt);
  DateTime get clinicEndAt => _toClinicVnTime(endAt);

  String get timeRange {
    final start = clinicStartAt;
    final end = clinicEndAt;
    final startH = start.hour.toString().padLeft(2, '0');
    final startM = start.minute.toString().padLeft(2, '0');
    final endH = end.hour.toString().padLeft(2, '0');
    final endM = end.minute.toString().padLeft(2, '0');
    return '$startH:$startM–$endH:$endM';
  }
}

/// Slot grid selector grouped by Morning (Sáng) and Afternoon (Chiều).
class SlotGridSelector extends StatelessWidget {
  const SlotGridSelector({
    required this.slots,
    required this.selectedSlot,
    required this.onSlotSelected,
    this.emptyMessage = 'Không có khung giờ khám trong ngày này.',
    super.key,
  });

  final List<SlotOption> slots;
  final SlotOption? selectedSlot;
  final ValueChanged<SlotOption> onSlotSelected;
  final String emptyMessage;

  bool _isSameSlot(SlotOption a, SlotOption b) =>
      a.startAt.toUtc() == b.startAt.toUtc() &&
      a.endAt.toUtc() == b.endAt.toUtc();

  Widget _buildGroup(
    BuildContext context, {
    required String title,
    required IconData icon,
    required List<SlotOption> groupSlots,
  }) {
    if (groupSlots.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 18, color: ClinicColors.muted),
            const SizedBox(width: 6),
            Text(
              title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: ClinicColors.ink,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: groupSlots.map((slot) {
            final isSelected =
                selectedSlot != null && _isSameSlot(slot, selectedSlot!);
            final isClickable = slot.isAvailable;

            return Semantics(
              button: true,
              enabled: isClickable,
              selected: isSelected,
              label: 'Khung giờ ${slot.timeRange}, ${isClickable ? "còn trống" : "đã kín"}',
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: isClickable ? () => onSlotSelected(slot) : null,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 48),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? ClinicColors.primary
                          : isClickable
                              ? ClinicColors.card
                              : ClinicColors.surfaceSubtle,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected
                            ? ClinicColors.primary
                            : isClickable
                                ? ClinicColors.primary.withValues(alpha: 0.45)
                                : ClinicColors.border,
                        width: isSelected ? 1.5 : 1.0,
                      ),
                    ),
                    child: Center(
                      widthFactor: 1,
                      child: Text(
                        slot.timeRange,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w600,
                          color: isSelected
                              ? Colors.white
                              : isClickable
                                  ? ClinicColors.ink
                                  : ClinicColors.mutedLight,
                          decoration:
                              isClickable ? null : TextDecoration.lineThrough,
                          decorationColor: ClinicColors.mutedLight,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 18),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (slots.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
        child: Center(
          child: Column(
            children: [
              const Icon(Icons.event_busy_outlined,
                  size: 40, color: ClinicColors.muted),
              const SizedBox(height: 10),
              Text(
                emptyMessage,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: ClinicColors.muted),
              ),
            ],
          ),
        ),
      );
    }

    // Split into Morning (< 12:00 VN time) and Afternoon (>= 12:00 VN time)
    final morningSlots =
        slots.where((s) => s.clinicStartAt.hour < 12).toList();
    final afternoonSlots =
        slots.where((s) => s.clinicStartAt.hour >= 12).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildGroup(
          context,
          title: 'Buổi sáng',
          icon: Icons.wb_sunny_outlined,
          groupSlots: morningSlots,
        ),
        _buildGroup(
          context,
          title: 'Buổi chiều',
          icon: Icons.wb_twilight_outlined,
          groupSlots: afternoonSlots,
        ),
      ],
    );
  }
}
