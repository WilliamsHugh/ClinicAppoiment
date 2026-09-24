import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class TimeSelector extends StatelessWidget {
  const TimeSelector({
    required this.times,
    required this.selectedTime,
    required this.onSelect,
    this.isLoading = false,
    this.error,
    super.key,
  });
  final List<String> times; // e.g., "07:30"
  final String? selectedTime;
  final ValueChanged<String> onSelect;
  final bool isLoading;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            const Text('Select Time',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink)),
            const Spacer(),
            GestureDetector(
              onTap: () {},
              child: const Text('View All',
                  style: TextStyle(
                      fontSize: 11,
                      color: ClinicColors.muted,
                      fontWeight: FontWeight.w500)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.fromLTRB(8, 12, 8, 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
          ),
          child: _buildContent(),
        ),
      ],
    );
  }

  Widget _buildContent() {
    if (isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      );
    }
    if (error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(error!,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: Colors.red)),
      );
    }
    if (times.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Text('Không có khung giờ trống ngày này',
            style: TextStyle(fontSize: 12, color: ClinicColors.muted)),
      );
    }
    return Column(
      children: [
        SizedBox(
          height: 56,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: List.generate(times.length, (i) {
              final isSelected = times[i] == selectedTime;
              return Expanded(
                child: GestureDetector(
                  onTap: () => onSelect(times[i]),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          _Bar(
                              height: isSelected ? 34 : 18,
                              selected: isSelected),
                          const SizedBox(width: 3),
                          _Bar(
                              height: isSelected ? 48 : 26,
                              selected: isSelected),
                          const SizedBox(width: 3),
                          _Bar(
                              height: isSelected ? 26 : 14,
                              selected: isSelected),
                          const SizedBox(width: 3),
                          _Bar(
                              height: isSelected ? 38 : 20,
                              selected: isSelected),
                        ],
                      ),
                      const SizedBox(height: 6),
                      if (isSelected)
                        Container(
                          height: 3,
                          width: 36,
                          decoration: BoxDecoration(
                            color: ClinicColors.primary,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        )
                      else
                        const SizedBox(height: 3),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: times
              .map((t) => Expanded(
                      child: Center(
                    child: Text(t,
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: t == selectedTime
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: t == selectedTime
                                ? ClinicColors.primary
                                : ClinicColors.muted)),
                  )))
              .toList(),
        ),
      ],
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.height, required this.selected});
  final double height;
  final bool selected;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 4,
      height: height,
      decoration: BoxDecoration(
        color: selected ? ClinicColors.primary : const Color(0xFFCBD5E1),
        borderRadius: BorderRadius.circular(4),
      ),
    );
  }
}
