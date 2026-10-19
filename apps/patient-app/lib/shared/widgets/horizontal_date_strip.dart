import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Horizontal scrollable date strip selector for 7 to 30 days.
class HorizontalDateStrip extends StatelessWidget {
  const HorizontalDateStrip({
    required this.selectedDate,
    required this.onDateSelected,
    this.startDate,
    this.daysCount = 14,
    super.key,
  });

  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateSelected;
  final DateTime? startDate;
  final int daysCount;

  static const _weekdayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final start = startDate ?? DateTime.now();
    final dates = List.generate(
      daysCount,
      (index) => DateTime(start.year, start.month, start.day + index),
    );

    return SizedBox(
      height: 80,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: dates.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final date = dates[index];
          final isSelected = _isSameDay(date, selectedDate);
          final isToday = _isSameDay(date, DateTime.now());
          final weekday = _weekdayNames[date.weekday % 7];

          return Semantics(
            selected: isSelected,
            button: true,
            label: 'Ngày ${date.day} tháng ${date.month}, $weekday',
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => onDateSelected(date),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 58,
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? ClinicColors.primary : ClinicColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isSelected
                        ? ClinicColors.primary
                        : isToday
                            ? ClinicColors.primary.withValues(alpha: 0.5)
                            : ClinicColors.border,
                    width: isSelected || isToday ? 1.5 : 1.0,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekday,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: isSelected
                            ? Colors.white.withValues(alpha: 0.9)
                            : ClinicColors.muted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${date.day}',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: isSelected ? Colors.white : ClinicColors.ink,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
