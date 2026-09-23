import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class DateItem {
  const DateItem({required this.day, required this.label, required this.isoDate});
  final String day;
  final String label;
  final String isoDate; // YYYY-MM-DD
}

class DateSelector extends StatelessWidget {
  const DateSelector({
    required this.dates,
    required this.selectedIndex,
    required this.onSelect,
    super.key,
  });
  final List<DateItem> dates;
  final int selectedIndex;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            const Text('Select Date',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink)),
            const Spacer(),
            Row(
              children: [
                const Icon(Icons.chevron_left, size: 14, color: ClinicColors.muted),
                const SizedBox(width: 4),
                const Text('February',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: ClinicColors.ink)),
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, size: 14, color: ClinicColors.muted),
              ],
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: List.generate(dates.length, (i) {
            final d = dates[i];
            final selected = i == selectedIndex;
            return Expanded(
              child: GestureDetector(
                onTap: () => onSelect(i),
                child: Container(
                  margin: EdgeInsets.only(left: i == 0 ? 0 : 6),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: selected ? ClinicColors.primary : Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                        color: selected ? ClinicColors.primary : ClinicColors.border),
                    boxShadow: selected
                        ? [
                            BoxShadow(
                                color: ClinicColors.primary.withOpacity(0.3),
                                blurRadius: 10,
                                offset: const Offset(0, 4))
                          ]
                        : null,
                  ),
                  child: Column(
                    children: [
                      Text(d.day,
                          style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: selected ? Colors.white : ClinicColors.ink)),
                      const SizedBox(height: 2),
                      Text(d.label,
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: selected
                                  ? Colors.white.withOpacity(0.9)
                                  : ClinicColors.muted)),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }
}
