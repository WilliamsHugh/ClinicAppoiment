import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../shared/widgets/async_states.dart';

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

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AppLoadingState(label: 'Đang tải thông báo...');
    if (_error != null) {
      return AppErrorState(message: _error!.message, requestId: _error!.requestId, onRetry: _load);
    }
    if (_items.isEmpty) {
      return const AppEmptyState(
        title: 'Chưa có thông báo',
        message: 'Thông báo dành cho tài khoản đang đăng nhập sẽ hiển thị tại đây.',
        icon: Icons.notifications_outlined,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final n = _items[index] as Map<String, dynamic>;
          final unread = n['status'] == 'UNREAD';
          return ListTile(
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(
              backgroundColor: unread ? const Color(0xFF0F766E) : Colors.grey[300],
              child: Icon(unread ? Icons.mark_email_unread : Icons.mark_email_read, color: Colors.white, size: 18),
            ),
            title: Text(n['title'].toString(), style: TextStyle(fontWeight: unread ? FontWeight.w700 : FontWeight.w400)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(n['message'].toString(), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text(_formatDate(n['createdAt'].toString()), style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
            trailing: unread
                ? TextButton(onPressed: () => _markRead(n['id'].toString()), child: const Text('Đã đọc'))
                : const Icon(Icons.check, size: 18, color: Colors.green),
            onTap: () {
              final payload = n['payload'] as Map<String, dynamic>?;
              final appointmentId = payload?['appointmentId']?.toString() ?? payload?['id']?.toString();
              if (appointmentId != null && mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Mở chi tiết: $appointmentId')));
              }
              if (unread) _markRead(n['id'].toString());
            },
          );
        },
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
