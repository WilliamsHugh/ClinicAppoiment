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
  PageMetadata? _pagination;
  int _page = 1;
  bool _loading = true;
  bool _loadingMore = false;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (refresh) _page = 1;
    setState(() {
      if (_items.isEmpty || refresh) {
        _loading = true;
      }
      _error = null;
    });
    try {
      final response = await _api.get(
        '/api/v1/notifications',
        query: {'page': _page, 'limit': 20},
      );
      final data = response.data as Map<String, dynamic>;
      final items = (data['items'] as List).cast<dynamic>();
      if (mounted) {
        setState(() {
          _items = refresh || _page == 1 ? items : [..._items, ...items];
          _pagination = response.pagination;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _loading) return;
    final canLoadMore = _pagination != null && _items.length < _pagination!.total;
    if (!canLoadMore) return;
    setState(() => _loadingMore = true);
    _page += 1;
    try {
      final response = await _api.get(
        '/api/v1/notifications',
        query: {'page': _page, 'limit': 20},
      );
      final data = response.data as Map<String, dynamic>;
      final items = (data['items'] as List).cast<dynamic>();
      if (mounted) {
        setState(() {
          _items = [..._items, ...items];
          _pagination = response.pagination;
        });
      }
    } on ApiException catch (error) {
      _page -= 1;
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  Future<void> _markRead(String id, {bool reload = false}) async {
    try {
      await _api.patch('/api/v1/notifications/$id/read', body: {});
      if (mounted) {
        setState(() {
          _items = _items.map((dynamic item) {
            final map = Map<String, dynamic>.from(item as Map);
            if (map['id'].toString() == id) {
              map['status'] = 'READ';
            }
            return map;
          }).toList();
        });
      }
      if (reload) await _load(refresh: true);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _markAllRead() async {
    try {
      final response =
          await _api.patch('/api/v1/notifications/read-all', body: {});
      final data = response.data as Map<String, dynamic>?;
      final readBeforeStr = data?['readBefore'] as String?;
      final readBefore =
          readBeforeStr != null ? DateTime.tryParse(readBeforeStr) : null;
      if (mounted) {
        setState(() {
          _items = _items.map((dynamic item) {
            final map = Map<String, dynamic>.from(item as Map);
            if (map['status'] == 'UNREAD') {
              if (readBefore != null) {
                final createdAtStr = map['createdAt'] as String?;
                final createdAt =
                    createdAtStr != null ? DateTime.tryParse(createdAtStr) : null;
                if (createdAt != null &&
                    (createdAt.isBefore(readBefore) ||
                        createdAt.isAtSameMomentAs(readBefore))) {
                  map['status'] = 'READ';
                }
              } else {
                map['status'] = 'READ';
              }
            }
            return map;
          }).toList();
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
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
        onRefresh: () => _load(refresh: true),
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          itemCount: display.length +
              1 +
              (_pagination != null && display.length < _pagination!.total
                  ? 1
                  : 0),
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, index) {
            if (index == 0) return const ReminderBanner();
            if (index == display.length + 1) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Center(
                  child: TextButton(
                    onPressed: _loadingMore ? null : _loadMore,
                    child: _loadingMore
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Tải thêm thông báo'),
                  ),
                ),
              );
            }
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
