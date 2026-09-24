import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import 'widgets/notification_tile.dart';
import 'widgets/reminder_banner.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({
    required this.tokenProvider,
    required this.onOpenRoute,
    this.api,
    super.key,
  });

  final TokenProvider tokenProvider;
  final void Function(String) onOpenRoute;
  final ClinicApiClient? api;

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
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.get(
        '/api/v1/notifications',
        query: {'page': 1, 'limit': 20},
      );
      final data = response.data as Map<String, dynamic>;
      if (mounted) {
        setState(() => _items = (data['items'] as List).cast<dynamic>());
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markRead(String id, {bool reload = true}) async {
    try {
      await _api.patch('/api/v1/notifications/$id/read', body: {});
      if (reload) await _load();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _markAllRead() async {
    final unreadIds = _items
        .where((item) => (item as Map<String, dynamic>)['status'] == 'UNREAD')
        .map((item) => (item as Map<String, dynamic>)['id'].toString())
        .toList(growable: false);
    for (final id in unreadIds) {
      await _markRead(id, reload: false);
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AppLoadingState(label: 'Đang tải thông báo...');
    if (_error != null) {
      return AppErrorState(
        message: _error!.message,
        requestId: _error!.requestId,
        onRetry: _load,
      );
    }
    if (_items.isEmpty) {
      return const AppEmptyState(
        title: 'Chưa có thông báo',
        message: 'Thông báo dành cho bạn sẽ hiển thị tại đây.',
        icon: Icons.notifications_outlined,
      );
    }

    final display = _items
        .map((item) => (item as Map).cast<String, dynamic>())
        .toList(growable: false);
    final hasUnread = display.any((item) => item['status'] == 'UNREAD');
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      appBar: AppBar(
        backgroundColor: ClinicColors.scaffold,
        title: const Text(
          'Thông báo',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: ClinicColors.ink,
          ),
        ),
        actions: [
          TextButton(
            onPressed: hasUnread ? _markAllRead : null,
            child: const Text('Đọc tất cả', style: TextStyle(fontSize: 12)),
          ),
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
            final notification = display[index - 1];
            final unread = notification['status'] == 'UNREAD';
            return NotificationTile(
              data: notification,
              onTap: () {
                final payload =
                    notification['payload'] as Map<String, dynamic>?;
                if (payload?['recordId'] != null) {
                  widget.onOpenRoute('/records');
                } else if (payload?['appointmentId'] != null) {
                  widget.onOpenRoute('/appointments');
                }
                if (unread) _markRead(notification['id'].toString());
              },
              onMarkRead: unread
                  ? () => _markRead(notification['id'].toString())
                  : null,
            );
          },
        ),
      ),
    );
  }
}
