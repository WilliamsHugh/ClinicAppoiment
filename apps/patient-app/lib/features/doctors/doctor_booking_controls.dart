import 'package:flutter/material.dart';

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

/// Reuses the existing calendar button until TV1 delivers HorizontalDateStrip.
class DoctorDateControl extends StatelessWidget {
  const DoctorDateControl({required this.input, super.key});
  final DoctorDateInput input;

  @override
  Widget build(BuildContext context) {
    void shift(int days) {
      final date = DateTime.parse(input.selectedDate).add(Duration(days: days));
      input.onChanged(
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}');
    }

    return Row(children: [
      IconButton(
          tooltip: 'Ngày trước',
          onPressed:
              input.enabled && input.selectedDate.compareTo(input.firstDate) > 0
                  ? () => shift(-1)
                  : null,
          icon: const Icon(Icons.chevron_left)),
      Expanded(
          child: OutlinedButton.icon(
              onPressed: input.enabled ? input.onOpenCalendar : null,
              icon: const Icon(Icons.calendar_month),
              label: Text('Ngày khám: ${input.selectedDate}'))),
      IconButton(
          tooltip: 'Ngày tiếp theo',
          onPressed:
              input.enabled && input.selectedDate.compareTo(input.lastDate) < 0
                  ? () => shift(1)
                  : null,
          icon: const Icon(Icons.chevron_right)),
    ]);
  }
}

/// Existing Wrap/ChoiceChip selector, kept feature-local while the shared kit is pending.
class DoctorSlotControl extends StatelessWidget {
  const DoctorSlotControl({required this.input, super.key});
  final DoctorSlotInput input;

  @override
  Widget build(BuildContext context) {
    final morning = input.slots
        .where(
            (slot) => int.parse(clinicTime(slot.startAt).substring(0, 2)) < 12)
        .toList();
    final afternoon = input.slots
        .where(
            (slot) => int.parse(clinicTime(slot.startAt).substring(0, 2)) >= 12)
        .toList();
    Widget group(String label, List<DoctorSlot> slots) =>
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          Wrap(
              spacing: 8,
              runSpacing: 8,
              children: slots.map((slot) {
                final unavailable =
                    input.unavailableKeys.contains(slotKey(slot));
                return ChoiceChip(
                  label: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text(
                        '${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)}'),
                    if (unavailable) const Text('Không còn khả dụng'),
                  ]),
                  selected: false,
                  backgroundColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  onSelected: input.enabled && !unavailable
                      ? (_) => input.onSelected(slot)
                      : null,
                );
              }).toList()),
          const SizedBox(height: 16),
        ]);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (morning.isNotEmpty) group('Buổi sáng', morning),
      if (afternoon.isNotEmpty) group('Buổi chiều / tối', afternoon),
    ]);
  }
}
