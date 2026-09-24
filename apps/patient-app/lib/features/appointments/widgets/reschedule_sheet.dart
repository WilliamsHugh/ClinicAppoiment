import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class RescheduleSheet extends StatefulWidget {
  const RescheduleSheet({required this.onConfirm, super.key});
  final void Function(DateTime start, DateTime end) onConfirm;

  @override
  State<RescheduleSheet> createState() => _RescheduleSheetState();
}

class _RescheduleSheetState extends State<RescheduleSheet> {
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  String _time = '08:00';

  final _times = const ['08:00', '09:30', '10:00', '14:00'];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Đổi lịch hẹn',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: ClinicColors.ink)),
          const SizedBox(height: 12),
          const Text('Chọn ngày',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: ClinicColors.ink)),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () async {
              final d = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 30)));
              if (d != null) setState(() => _date = d);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: ClinicColors.border)),
              child: Row(
                children: [
                  const Icon(Icons.calendar_today_outlined,
                      size: 16, color: ClinicColors.muted),
                  const SizedBox(width: 8),
                  Text('${_date.day}/${_date.month}/${_date.year}',
                      style: const TextStyle(fontSize: 13)),
                  const Spacer(),
                  const Icon(Icons.chevron_right,
                      size: 16, color: ClinicColors.muted),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Chọn giờ',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: ClinicColors.ink)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: _times
                .map((t) => ChoiceChip(
                      label: Text(t),
                      selected: _time == t,
                      onSelected: (_) => setState(() => _time = t),
                      selectedColor: ClinicColors.primary,
                      labelStyle: TextStyle(
                          color: _time == t ? Colors.white : ClinicColors.ink,
                          fontWeight: FontWeight.w600,
                          fontSize: 12),
                    ))
                .toList(),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                final parts = _time.split(':');
                final start = DateTime(_date.year, _date.month, _date.day,
                    int.parse(parts[0]), int.parse(parts[1]));
                final end = start.add(const Duration(minutes: 30));
                widget.onConfirm(start, end);
                Navigator.of(context).pop();
              },
              child: const Text('Xác nhận đổi lịch'),
            ),
          ),
        ],
      ),
    );
  }
}
