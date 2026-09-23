import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class NotificationTile extends StatelessWidget {
  const NotificationTile({
    required this.data,
    required this.onTap,
    required this.onMarkRead,
    super.key,
  });
  final Map<String, dynamic> data;
  final VoidCallback onTap;
  final VoidCallback? onMarkRead;

  bool get unread => data['status'] == 'UNREAD';

  IconData _iconForType(String? type) {
    switch (type) {
      case 'appointment.reminder.24h':
        return Icons.alarm;
      case 'appointment.reminder.1h':
        return Icons.notification_important_outlined;
      case 'appointment.created':
      case 'appointment.confirmed':
        return Icons.event_available_outlined;
      default:
        return Icons.notifications_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = data['type']?.toString();
    final isReminder = type?.contains('reminder') == true;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: unread ? ClinicColors.primary.withOpacity(0.18) : ClinicColors.border),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 10, offset: const Offset(0, 4))
        ],
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: unread
                    ? (isReminder ? const Color(0xFFFFF7ED) : const Color(0xFFEFF6FF))
                    : const Color(0xFFF1F5F9),
                shape: BoxShape.circle,
              ),
              child: Icon(_iconForType(type),
                  size: 18,
                  color: isReminder ? const Color(0xFFF59E0B) : ClinicColors.primary),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(data['title'].toString(),
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: unread ? FontWeight.w700 : FontWeight.w600,
                                color: ClinicColors.ink)),
                      ),
                      if (unread)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                              color: ClinicColors.primary, shape: BoxShape.circle),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(data['message'].toString(),
                      maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: ClinicColors.muted, height: 1.35)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      if (isReminder)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                              color: const Color(0xFFFFF7ED),
                              borderRadius: BorderRadius.circular(8)),
                          child: Text(
                              type == 'appointment.reminder.24h' ? 'Nhắc 24h' : 'Nhắc 1h',
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFF59E0B))),
                        ),
                      const Spacer(),
                      Text(_fmt(data['createdAt'].toString()),
                          style: const TextStyle(fontSize: 10, color: ClinicColors.mutedLight)),
                    ],
                  ),
                ],
              ),
            ),
            if (unread) ...[
              const SizedBox(width: 6),
              TextButton(
                onPressed: onMarkRead,
                style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                child: const Text('Đã đọc', style: TextStyle(fontSize: 11)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _fmt(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      return '${d.day}/${d.month} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
