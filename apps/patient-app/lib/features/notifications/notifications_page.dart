import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import 'widgets/notification_tile.dart';
import 'widgets/reminder_banner.dart';

class _DevTokenProvider implements TokenProvider {
  const _DevTokenProvider();
  @override
  Future<String?> getAccessToken() async => 'dev-token';
}

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  late final ClinicApiClient _api;
  List<dynamic> _items = [];
  bool _loading = true;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _api = ClinicApiClient(tokenProvider: const _DevTokenProvider());
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.get('/api/v1/notifications', query: {'page': 1, 'limit': 20});
      final data = response.data as Map<String, dynamic>;
      setState(() => _items = (data['items'] as List).cast<dynamic>());
    } on ApiException catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markRead(String id) async {
    try {
      await _api.patch('/api/v1/notifications/$id/read', body: {});
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  List<Map<String, dynamic>> get _fallback => [
        {
          'id': 'n1',
          'title': 'Nhắc lịch 24h',
          'message': 'Bạn có lịch với Dr. Sarah Smith lúc 08:00 ngày mai. Nhớ chuẩn bị hồ sơ.',
          'type': 'appointment.reminder.24h',
          'status': 'UNREAD',
          'createdAt': DateTime.now().subtract(const Duration(hours: 2)).toIso8601String(),
          'payload': {'appointmentId': 'apt-1'}
        },
        {
          'id': 'n2',
          'title': 'Nhắc lịch 1h',
          'message': 'Lịch hẹn sắp diễn ra trong 1 giờ. Vui lòng có mặt trước 10 phút.',
          'type': 'appointment.reminder.1h',
          'status': 'UNREAD',
          'createdAt': DateTime.now().subtract(const Duration(minutes: 30)).toIso8601String(),
          'payload': {'appointmentId': 'apt-2'}
        },
        {
          'id': 'n3',
          'title': 'Lịch hẹn đã xác nhận',
          'message': 'Lịch với Dr. Alex Johnson đã được xác nhận.',
          'type': 'appointment.confirmed',
          'status': 'READ',
          'createdAt': DateTime.now().subtract(const Duration(days: 1)).toIso8601String(),
          'payload': {'appointmentId': 'apt-2'}
        },
      ];

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AppLoadingState(label: 'Đang tải thông báo...');
    if (_error != null) {
      return AppErrorState(message: _error!.message, requestId: _error!.requestId, onRetry: _load);
    }
    final display = _items.isEmpty
        ? _fallback
        : _items.map((e) => (e as Map).cast<String, dynamic>()).toList();

    if (display.isEmpty) {
      return const AppEmptyState(
        title: 'Chưa có thông báo',
        message: 'Thông báo dành cho tài khoản đang đăng nhập sẽ hiển thị tại đây.',
        icon: Icons.notifications_outlined,
      );
    }
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      appBar: AppBar(
        backgroundColor: ClinicColors.scaffold,
        title: const Text('Thông báo',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: ClinicColors.ink)),
        actions: [
          TextButton(
              onPressed: () async {
                for (final n in display.where((e) => e['status'] == 'UNREAD')) {
                  await _markRead(n['id'].toString());
                }
              },
              child: const Text('Đã đọc all', style: TextStyle(fontSize: 12))),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          itemCount: display.length + 1,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, index) {
            if (index == 0) return const ReminderBanner();
            final n = display[index - 1];
            final unread = n['status'] == 'UNREAD';
            return NotificationTile(
              data: n,
              onTap: () {
                final payload = n['payload'] as Map<String, dynamic>?;
                final appointmentId = payload?['appointmentId']?.toString();
                if (appointmentId != null && mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text('Mở chi tiết: $appointmentId')));
                }
                if (unread) _markRead(n['id'].toString());
              },
              onMarkRead: () => _markRead(n['id'].toString()),
            );
          },
        ),
      ),
    );
  }
}
