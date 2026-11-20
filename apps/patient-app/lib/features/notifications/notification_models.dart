import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

enum NotificationFilter {
  all,
  unread,
}

enum NotificationStatus {
  unread,
  read,
  failed,
  unknown;

  static NotificationStatus fromApi(String? raw) {
    switch (raw?.trim().toUpperCase()) {
      case 'UNREAD':
        return NotificationStatus.unread;
      case 'READ':
        return NotificationStatus.read;
      case 'FAILED':
        return NotificationStatus.failed;
      default:
        return NotificationStatus.unknown;
    }
  }
}

@immutable
class NotificationTypeMeta {
  const NotificationTypeMeta({
    required this.label,
    required this.icon,
    required this.foregroundColor,
    required this.backgroundColor,
  });

  final String label;
  final IconData icon;
  final Color foregroundColor;
  final Color backgroundColor;
}

NotificationTypeMeta resolveNotificationTypeMeta(String type) {
  switch (type.trim()) {
    case 'appointment.created':
      return const NotificationTypeMeta(
        label: 'Lịch hẹn mới',
        icon: Icons.event_note_outlined,
        foregroundColor: ClinicColors.primaryDark,
        backgroundColor: ClinicColors.primarySoft,
      );
    case 'appointment.confirmed':
      return const NotificationTypeMeta(
        label: 'Đã xác nhận',
        icon: Icons.event_available_outlined,
        foregroundColor: ClinicColors.successDark,
        backgroundColor: ClinicColors.successLight,
      );
    case 'appointment.rescheduled':
      return const NotificationTypeMeta(
        label: 'Đổi lịch hẹn',
        icon: Icons.update_outlined,
        foregroundColor: ClinicColors.infoDark,
        backgroundColor: ClinicColors.infoLight,
      );
    case 'appointment.cancelled':
      return const NotificationTypeMeta(
        label: 'Đã hủy lịch',
        icon: Icons.event_busy_outlined,
        foregroundColor: ClinicColors.danger,
        backgroundColor: ClinicColors.dangerLight,
      );
    case 'appointment.checked_in':
      return const NotificationTypeMeta(
        label: 'Đã check-in',
        icon: Icons.how_to_reg_outlined,
        foregroundColor: ClinicColors.infoDark,
        backgroundColor: ClinicColors.infoLight,
      );
    case 'appointment.reminder':
    case 'appointment.reminder.24h':
      return const NotificationTypeMeta(
        label: 'Nhắc lịch 24h',
        icon: Icons.alarm,
        foregroundColor: ClinicColors.warningDark,
        backgroundColor: ClinicColors.warningLight,
      );
    case 'appointment.reminder.1h':
      return const NotificationTypeMeta(
        label: 'Nhắc lịch 1h',
        icon: Icons.notification_important_outlined,
        foregroundColor: ClinicColors.warningDark,
        backgroundColor: ClinicColors.warningLight,
      );
    case 'medical-record.created':
      return const NotificationTypeMeta(
        label: 'Hồ sơ khám mới',
        icon: Icons.description_outlined,
        foregroundColor: ClinicColors.primaryDark,
        backgroundColor: ClinicColors.primarySoft,
      );
    case 'medical-record.updated':
      return const NotificationTypeMeta(
        label: 'Cập nhật hồ sơ',
        icon: Icons.assignment_turned_in_outlined,
        foregroundColor: ClinicColors.primaryDark,
        backgroundColor: ClinicColors.primarySoft,
      );
    default:
      return const NotificationTypeMeta(
        label: 'Thông báo',
        icon: Icons.notifications_outlined,
        foregroundColor: ClinicColors.primaryDark,
        backgroundColor: ClinicColors.primarySoft,
      );
  }
}

String formatClinicVnTimestamp(DateTime? value, {String fallback = ''}) {
  if (value == null) return fallback;
  final vn = value.toUtc().add(const Duration(hours: 7));
  final hour = vn.hour.toString().padLeft(2, '0');
  final minute = vn.minute.toString().padLeft(2, '0');
  final day = vn.day.toString().padLeft(2, '0');
  final month = vn.month.toString().padLeft(2, '0');
  final year = vn.year.toString().padLeft(4, '0');
  return '$hour:$minute $day/$month/$year';
}

@immutable
class AppNotification {
  const AppNotification({
    required this.id,
    required this.recipientUserId,
    required this.type,
    required this.title,
    required this.message,
    required this.status,
    required this.createdAtRaw,
    this.createdAt,
    this.readAt,
    this.appointmentId,
    this.recordId,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final rawPayload = json['payload'];
    final Map<String, dynamic> payload = rawPayload is Map
        ? rawPayload.map((key, value) => MapEntry(key.toString(), value))
        : const <String, dynamic>{};

    final createdAtRaw = _readNonEmptyString(json['createdAt']) ?? '';
    final readAtRaw = _readNonEmptyString(json['readAt']);

    return AppNotification(
      id: _readNonEmptyString(json['id']) ?? '',
      recipientUserId: _readNonEmptyString(json['recipientUserId']) ?? '',
      type: _readNonEmptyString(json['type']) ?? '',
      title: _readNonEmptyString(json['title']) ?? 'Thông báo',
      message: _readNonEmptyString(json['message']) ?? '',
      status: NotificationStatus.fromApi(_readNonEmptyString(json['status'])),
      createdAt:
          createdAtRaw.isEmpty ? null : DateTime.tryParse(createdAtRaw),
      createdAtRaw: createdAtRaw,
      readAt: readAtRaw == null ? null : DateTime.tryParse(readAtRaw),
      appointmentId: _readNonEmptyString(payload['appointmentId']),
      recordId: _readNonEmptyString(payload['recordId']),
    );
  }

  static AppNotification? tryFromMap(Object? raw) {
    if (raw is! Map) return null;
    final map = raw.map((key, value) => MapEntry(key.toString(), value));
    return AppNotification.fromJson(map);
  }

  final String id;
  final String recipientUserId;
  final String type;
  final String title;
  final String message;
  final NotificationStatus status;
  final DateTime? createdAt;
  final String createdAtRaw;
  final DateTime? readAt;
  final String? appointmentId;
  final String? recordId;

  bool get isUnread => status == NotificationStatus.unread;
  bool get isRead => status == NotificationStatus.read;
  bool get isFailed => status == NotificationStatus.failed;
  bool get isReminder =>
      type == 'appointment.reminder' ||
      type.startsWith('appointment.reminder.');

  String? get targetRoute {
    if (recordId != null) return '/records';
    if (appointmentId != null) return '/appointments';
    return null;
  }

  String? get routeHintLabel {
    if (recordId != null) return 'Xem hồ sơ khám';
    if (appointmentId != null) return 'Xem lịch hẹn';
    return null;
  }

  NotificationTypeMeta get typeMeta => resolveNotificationTypeMeta(type);

  String get formattedCreatedAt =>
      formatClinicVnTimestamp(createdAt, fallback: createdAtRaw);

  AppNotification markAsRead({DateTime? readAt}) {
    return AppNotification(
      id: id,
      recipientUserId: recipientUserId,
      type: type,
      title: title,
      message: message,
      status: NotificationStatus.read,
      createdAt: createdAt,
      createdAtRaw: createdAtRaw,
      readAt: this.readAt ?? readAt ?? DateTime.now().toUtc(),
      appointmentId: appointmentId,
      recordId: recordId,
    );
  }

  static String? _readNonEmptyString(Object? value) {
    if (value == null || value is Map || value is Iterable) return null;
    if (value is! String && value is! num && value is! bool) return null;
    final text = value.toString().trim();
    return text.isEmpty ? null : text;
  }
}
