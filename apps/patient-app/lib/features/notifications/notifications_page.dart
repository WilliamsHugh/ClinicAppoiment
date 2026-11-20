import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/clinic_page_header.dart';
import 'notification_models.dart';
import 'widgets/notification_tile.dart';
import 'widgets/reminder_banner.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({
    required this.tokenProvider,
    required this.onOpenRoute,
    this.api,
    this.onUnreadCountChanged,
    super.key,
  });

  final TokenProvider tokenProvider;
  final void Function(String) onOpenRoute;
  final ClinicApiClient? api;
  final VoidCallback? onUnreadCountChanged;

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  static const int _pageLimit = 20;

  late ClinicApiClient _api;
  RequestCancellation? _cancellation;
  RequestCancellation? _mutationCancellation;
  int _loadSequence = 0;
  int _mutationGeneration = 0;
  int _markAllGeneration = 0;

  List<AppNotification> _items = const [];
  PageMetadata? _pagination;
  int _page = 1;
  NotificationFilter _filter = NotificationFilter.all;
  int? _serverUnreadCount;

  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMoreExhausted = false;
  bool _markingAllRead = false;
  final Set<String> _markingIds = <String>{};

  String? _errorMessage;
  String? _errorRequestId;

  @override
  void initState() {
    super.initState();
    _resetApi();
    _load();
  }

  @override
  void didUpdateWidget(covariant NotificationsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api ||
        oldWidget.tokenProvider != widget.tokenProvider) {
      _cancellation?.cancel();
      _mutationCancellation?.cancel();
      _mutationCancellation = null;
      _loadSequence += 1;
      _mutationGeneration += 1;
      _markAllGeneration += 1;
      _resetApi();
      _items = const [];
      _pagination = null;
      _page = 1;
      _serverUnreadCount = null;
      _loading = true;
      _loadingMore = false;
      _hasMoreExhausted = false;
      _markingAllRead = false;
      _markingIds.clear();
      _errorMessage = null;
      _errorRequestId = null;
      _load(refresh: true);
    }
  }

  @override
  void dispose() {
    _cancellation?.cancel();
    _mutationCancellation?.cancel();
    super.dispose();
  }

  void _resetApi() {
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
  }

  int get _localUnreadCount => _items.where((item) => item.isUnread).length;

  int get _effectiveUnreadCount {
    final local = _localUnreadCount;
    final server = _serverUnreadCount;
    if (server == null) return local;
    return server > local ? server : local;
  }

  bool get _hasUnread => _effectiveUnreadCount > 0;

  String get _headerSubtitle {
    if (_loading && _items.isEmpty) {
      return 'Đang cập nhật thông báo mới nhất';
    }
    final count = _effectiveUnreadCount;
    if (count > 0) {
      return 'Bạn có $count thông báo chưa đọc';
    }
    return 'Cập nhật lịch hẹn và kết quả khám';
  }

  Future<void> _load({bool refresh = false}) async {
    _cancellation?.cancel();
    final cancellation = RequestCancellation();
    _cancellation = cancellation;
    final requestSeq = ++_loadSequence;
    final targetPage = refresh ? 1 : _page;

    setState(() {
      if (_items.isEmpty || refresh) {
        _loading = true;
      }
      _loadingMore = false;
      _hasMoreExhausted = false;
      _markingAllRead = false;
      _markingIds.clear();
      _errorMessage = null;
      _errorRequestId = null;
    });

    final query = <String, Object?>{
      'page': targetPage,
      'limit': _pageLimit,
      if (_filter == NotificationFilter.unread) 'status': 'UNREAD',
    };

    try {
      final listFuture = _api.get(
        '/api/v1/notifications',
        query: query,
        cancellation: cancellation,
      );
      final unreadFuture = _fetchUnreadCount(cancellation);

      final response = await listFuture;
      final unreadCount = await unreadFuture;

      if (!mounted ||
          requestSeq != _loadSequence ||
          cancellation.isCancelled) {
        return;
      }

      final parsedItems = _parseNotificationItems(response.data);
      setState(() {
        _page = targetPage;
        _items = refresh || targetPage == 1
            ? parsedItems
            : <AppNotification>[..._items, ...parsedItems];
        _pagination = response.pagination;
        _serverUnreadCount = unreadCount;
      });
    } on ApiException catch (error) {
      if (error.code == 'REQUEST_CANCELLED' ||
          requestSeq != _loadSequence ||
          cancellation.isCancelled) {
        return;
      }
      if (mounted) {
        if (_items.isNotEmpty) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(error.message)));
        } else {
          setState(() {
            _errorMessage = error.message;
            _errorRequestId = error.requestId;
          });
        }
      }
    } catch (_) {
      if (requestSeq != _loadSequence || cancellation.isCancelled) {
        return;
      }
      if (mounted) {
        const message = 'Không thể tải danh sách thông báo. Vui lòng thử lại.';
        if (_items.isNotEmpty) {
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text(message)));
        } else {
          setState(() {
            _errorMessage = message;
            _errorRequestId = null;
          });
        }
      }
    } finally {
      if (mounted && requestSeq == _loadSequence) {
        setState(() => _loading = false);
      }
    }
  }

  Future<int?> _fetchUnreadCount(RequestCancellation cancellation) async {
    try {
      final response = await _api.get(
        '/api/v1/notifications/unread-count',
        cancellation: cancellation,
      );
      final data = response.data;
      if (data is Map && data['unreadCount'] is num) {
        return (data['unreadCount'] as num).toInt().clamp(0, 1 << 30);
      }
    } catch (_) {
      // Fallback sang đếm cục bộ khi endpoint lỗi hoặc mock test chưa stub /unread-count.
    }
    return null;
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _loading || _hasMoreExhausted) return;
    final canLoadMore =
        _pagination != null && _items.length < _pagination!.total;
    if (!canLoadMore) return;

    final requestSeq = _loadSequence;
    final startMutationGen = _mutationGeneration;
    final startMarkAllGen = _markAllGeneration;
    final cancellation = _cancellation;
    final nextPage = _page + 1;
    setState(() => _loadingMore = true);

    try {
      final response = await _api.get(
        '/api/v1/notifications',
        query: <String, Object?>{
          'page': nextPage,
          'limit': _pageLimit,
          if (_filter == NotificationFilter.unread) 'status': 'UNREAD',
        },
        cancellation: cancellation,
      );
      if (!mounted ||
          requestSeq != _loadSequence ||
          (cancellation?.isCancelled ?? false)) {
        return;
      }
      if (startMarkAllGen != _markAllGeneration) {
        setState(() => _loadingMore = false);
        if (_filter == NotificationFilter.unread &&
            _items.isEmpty &&
            _hasUnread) {
          unawaited(_load(refresh: true));
        }
        return;
      }
      final parsedItems = _parseNotificationItems(response.data);
      final effectiveLimit =
          response.pagination?.limit ?? _pagination?.limit ?? _pageLimit;
      final reachedEnd =
          parsedItems.isEmpty || parsedItems.length < effectiveLimit;
      final existingIds = _items
          .map((item) => item.id)
          .where((id) => id.isNotEmpty)
          .toSet();
      final dedupedItems = parsedItems
          .where((item) => item.id.isNotEmpty && existingIds.add(item.id))
          .toList(growable: false);
      setState(() {
        _page = nextPage;
        _items = <AppNotification>[..._items, ...dedupedItems];
        if (reachedEnd) {
          _hasMoreExhausted = true;
        }
        final incomingPagination = response.pagination;
        if (incomingPagination != null) {
          if (startMutationGen != _mutationGeneration &&
              _filter == NotificationFilter.unread &&
              _pagination != null) {
            final nextTotal =
                math.min(incomingPagination.total, _pagination!.total);
            _pagination = PageMetadata(
              page: incomingPagination.page,
              limit: incomingPagination.limit,
              total: nextTotal,
            );
          } else {
            _pagination = incomingPagination;
          }
        } else {
          _pagination = null;
        }
      });
    } on ApiException catch (error) {
      if (error.code == 'REQUEST_CANCELLED' || requestSeq != _loadSequence) {
        return;
      }
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (_) {
      if (requestSeq != _loadSequence) return;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Không thể tải thêm thông báo. Vui lòng thử lại.'),
          ),
        );
      }
    } finally {
      if (mounted && requestSeq == _loadSequence && _loadingMore) {
        setState(() => _loadingMore = false);
      }
    }
  }

  Future<void> _markRead(AppNotification target) async {
    if (!target.isUnread ||
        target.id.isEmpty ||
        _markingIds.contains(target.id)) {
      return;
    }

    final seq = _loadSequence;
    final cancellation = _mutationCancellation ??= RequestCancellation();
    setState(() => _markingIds.add(target.id));
    try {
      final response = await _api.patch(
        '/api/v1/notifications/${target.id}/read',
        body: const <String, Object?>{},
        cancellation: cancellation,
      );
      if (!mounted || seq != _loadSequence || cancellation.isCancelled) {
        return;
      }

      final serverUpdated = AppNotification.tryFromMap(response.data);
      final updated = (serverUpdated != null && serverUpdated.id == target.id)
          ? serverUpdated
          : target.markAsRead();

      var shouldReloadUnread = false;
      setState(() {
        _mutationGeneration += 1;
        if (_filter == NotificationFilter.unread) {
          _items = _items
              .where((item) => item.id != target.id)
              .toList(growable: false);
          if (_pagination != null && _pagination!.total > 0) {
            _pagination = PageMetadata(
              page: _pagination!.page,
              limit: _pagination!.limit,
              total: _pagination!.total - 1,
            );
          }
          if (_serverUnreadCount != null && _serverUnreadCount! > 0) {
            _serverUnreadCount = _serverUnreadCount! - 1;
          }
          final hasRemainingOnServer =
              (_pagination != null && _pagination!.total > 0) ||
                  (_serverUnreadCount != null && _serverUnreadCount! > 0);
          if (_items.isEmpty && hasRemainingOnServer) {
            shouldReloadUnread = true;
          }
        } else {
          _items = _items
              .map((item) => item.id == target.id ? updated : item)
              .toList(growable: false);
          if (_serverUnreadCount != null && _serverUnreadCount! > 0) {
            _serverUnreadCount = _serverUnreadCount! - 1;
          }
        }
      });
      widget.onUnreadCountChanged?.call();
      if (shouldReloadUnread) {
        unawaited(_load(refresh: true));
      }
    } on ApiException catch (error) {
      if (error.code == 'REQUEST_CANCELLED' ||
          !mounted ||
          seq != _loadSequence ||
          cancellation.isCancelled) {
        return;
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted || seq != _loadSequence || cancellation.isCancelled) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Không thể đánh dấu đã đọc. Vui lòng thử lại.'),
        ),
      );
    } finally {
      if (mounted && seq == _loadSequence) {
        setState(() => _markingIds.remove(target.id));
      }
    }
  }

  Future<void> _markAllRead() async {
    if (_markingAllRead || !_hasUnread) return;
    final seq = _loadSequence;
    final cancellation = _mutationCancellation ??= RequestCancellation();
    setState(() => _markingAllRead = true);
    try {
      final response = await _api.patch(
        '/api/v1/notifications/read-all',
        body: const <String, Object?>{},
        cancellation: cancellation,
      );
      if (!mounted || seq != _loadSequence || cancellation.isCancelled) {
        return;
      }

      final rawData = response.data;
      final Map<String, dynamic>? data = rawData is Map
          ? rawData.map((key, value) => MapEntry(key.toString(), value))
          : null;
      final readBeforeStr = data?['readBefore']?.toString();
      final readBefore = readBeforeStr != null
          ? DateTime.tryParse(readBeforeStr)?.toUtc()
          : null;
      final readAtStr = data?['readAt']?.toString();
      final readAt =
          readAtStr != null ? DateTime.tryParse(readAtStr)?.toUtc() : null;

      final updatedList = _items.map((item) {
        if (!item.isUnread) return item;
        if (readBefore != null) {
          final createdUtc = item.createdAt?.toUtc();
          if (createdUtc != null && !createdUtc.isAfter(readBefore)) {
            return item.markAsRead(readAt: readAt);
          }
          return item;
        }
        return item.markAsRead(readAt: readAt);
      }).toList(growable: false);

      var shouldReloadUnread = false;
      setState(() {
        final previousServerUnread = _serverUnreadCount;
        final serverUnread = data?['unreadCount'];
        final serverUpdatedCount = data?['updatedCount'];
        final hadUnreadItems = _items.any((item) => item.isUnread);
        if (_filter == NotificationFilter.unread) {
          final remainingUnread = updatedList
              .where((item) => item.isUnread)
              .toList(growable: false);
          final removedCount = _items.length - remainingUnread.length;
          if (removedCount > 0) {
            _mutationGeneration += 1;
          }
          _items = remainingUnread;
          if (_pagination != null) {
            final nextTotal = serverUnread is num
                ? serverUnread.toInt().clamp(remainingUnread.length, 1 << 30)
                : (readBefore == null
                    ? remainingUnread.length
                    : (_pagination!.total - removedCount)
                        .clamp(remainingUnread.length, 1 << 30));
            _pagination = PageMetadata(
              page: _pagination!.page,
              limit: _pagination!.limit,
              total: nextTotal,
            );
          }
          final hasRemainingOnServer =
              (serverUnread is num && serverUnread.toInt() > 0) ||
                  (_pagination != null && _pagination!.total > 0);
          if (remainingUnread.isEmpty && hasRemainingOnServer) {
            shouldReloadUnread = true;
          }
        } else {
          if (hadUnreadItems && updatedList.length == _items.length) {
            _mutationGeneration += 1;
          }
          _items = updatedList;
        }

        if (serverUnread is num) {
          _serverUnreadCount = serverUnread.toInt().clamp(0, 1 << 30);
        } else if (_serverUnreadCount != null) {
          _serverUnreadCount =
              updatedList.where((item) => item.isUnread).length;
        }

        final appliedReadAll = hadUnreadItems ||
            _serverUnreadCount != previousServerUnread ||
            (serverUpdatedCount is num && serverUpdatedCount.toInt() > 0);
        if (appliedReadAll) {
          _markAllGeneration += 1;
        }
      });
      widget.onUnreadCountChanged?.call();
      if (shouldReloadUnread) {
        unawaited(_load(refresh: true));
      }
    } on ApiException catch (error) {
      if (error.code == 'REQUEST_CANCELLED' ||
          !mounted ||
          seq != _loadSequence ||
          cancellation.isCancelled) {
        return;
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted || seq != _loadSequence || cancellation.isCancelled) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Không thể đánh dấu đọc tất cả. Vui lòng thử lại.'),
        ),
      );
    } finally {
      if (mounted && seq == _loadSequence) {
        setState(() => _markingAllRead = false);
      }
    }
  }

  void _setFilter(NotificationFilter next) {
    if (_filter == next) return;
    setState(() {
      _filter = next;
      _items = const [];
      _pagination = null;
      _page = 1;
    });
    _load(refresh: true);
  }

  void _handleTileTap(AppNotification notification) {
    if (notification.isUnread) {
      unawaited(_markRead(notification));
    }
    final route = notification.targetRoute;
    if (route != null) {
      widget.onOpenRoute(route);
      return;
    }
    _showDetailSheet(notification);
  }

  void _showDetailSheet(AppNotification notification) {
    final meta = notification.typeMeta;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: ClinicColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
      ),
      isScrollControlled: true,
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.85,
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Flexible(
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(
                            width: double.infinity,
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 6,
                              alignment: WrapAlignment.spaceBetween,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: meta.backgroundColor,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    meta.label,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: meta.foregroundColor,
                                    ),
                                  ),
                                ),
                                if (notification.formattedCreatedAt.isNotEmpty)
                                  Text(
                                    notification.formattedCreatedAt,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: ClinicColors.muted,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            notification.title,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: ClinicColors.ink,
                            ),
                          ),
                          if (notification.message.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              notification.message,
                              style: const TextStyle(
                                fontSize: 14,
                                color: ClinicColors.muted,
                                height: 1.5,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => Navigator.of(sheetContext).pop(),
                      child: const Text('Đóng'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  List<AppNotification> _parseNotificationItems(Object? data) {
    if (data is! Map) {
      throw const FormatException('Dữ liệu thông báo không hợp lệ.');
    }
    final rawItems = data['items'];
    if (rawItems is! List) {
      throw const FormatException('Danh sách thông báo không hợp lệ.');
    }
    return rawItems
        .map(AppNotification.tryFromMap)
        .whereType<AppNotification>()
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final useCompactHeaderAction = _hasUnread &&
        MediaQuery.sizeOf(context).width < 400 &&
        MediaQuery.textScalerOf(context).scale(14) > 15.5;
    final Widget? markAllButton = _hasUnread
        ? TextButton(
            onPressed: _markingAllRead ? null : _markAllRead,
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              disabledForegroundColor: Colors.white.withValues(alpha: 0.65),
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 10,
              ),
              backgroundColor: ClinicColors.primaryDark.withValues(alpha: 0.45),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: Colors.white.withValues(alpha: 0.35),
                ),
              ),
              textStyle: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_markingAllRead) ...[
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                const Text('Đọc tất cả'),
              ],
            ),
          )
        : null;

    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClinicPageHeader(
            title: 'Thông báo',
            subtitle: _headerSubtitle,
            padding: useCompactHeaderAction
                ? const EdgeInsets.fromLTRB(20, 12, 16, 8)
                : const EdgeInsets.fromLTRB(20, 12, 16, 16),
            trailing: useCompactHeaderAction ? null : markAllButton,
            bottom: useCompactHeaderAction
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 16, 12),
                    child: Align(
                      alignment: Alignment.centerRight,
                      child: markAllButton,
                    ),
                  )
                : null,
          ),
          _FilterBar(
            selected: _filter,
            onSelect: _setFilter,
          ),
          Expanded(
            child: RefreshIndicator(
              color: ClinicColors.primary,
              onRefresh: () => _load(refresh: true),
              child: _buildBody(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _items.isEmpty) {
      return _buildScrollableCentered(
        const AppLoadingState(label: 'Đang tải thông báo...'),
      );
    }

    if (_errorMessage != null && _items.isEmpty) {
      return _buildScrollableCentered(
        AppErrorState(
          message: _errorMessage!,
          requestId: _errorRequestId,
          onRetry: () => _load(refresh: true),
        ),
      );
    }

    if (_items.isEmpty) {
      if (_filter == NotificationFilter.unread) {
        return _buildScrollableCentered(
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.mark_email_read_outlined,
                  size: 44,
                  color: ClinicColors.primary,
                ),
                const SizedBox(height: 12),
                Text(
                  'Không có thông báo chưa đọc',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Bạn đã đọc toàn bộ thông báo hiện có.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: ClinicColors.muted),
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () => _setFilter(NotificationFilter.all),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Xem tất cả thông báo'),
                ),
              ],
            ),
          ),
        );
      }

      return _buildScrollableCentered(
        const AppEmptyState(
          title: 'Chưa có thông báo',
          message: 'Thông báo dành cho bạn sẽ hiển thị tại đây.',
          icon: Icons.notifications_outlined,
        ),
      );
    }

    final hasMore = !_hasMoreExhausted &&
        _pagination != null &&
        _items.length < _pagination!.total;
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: _items.length + 1 + (hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        if (index == 0) {
          return const ReminderBanner();
        }
        if (index == _items.length + 1) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: TextButton(
                onPressed: _loadingMore ? null : _loadMore,
                style: TextButton.styleFrom(
                  minimumSize: const Size(48, 48),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _loadingMore
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Tải thêm thông báo'),
              ),
            ),
          );
        }

        final notification = _items[index - 1];
        return NotificationTile(
          notification: notification,
          markingRead: _markingIds.contains(notification.id),
          onTap: () => _handleTileTap(notification),
          onMarkRead:
              notification.isUnread ? () => _markRead(notification) : null,
        );
      },
    );
  }

  Widget _buildScrollableCentered(Widget child) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(child: child),
          ),
        );
      },
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.selected,
    required this.onSelect,
  });

  final NotificationFilter selected;
  final ValueChanged<NotificationFilter> onSelect;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Row(
        children: [
          Expanded(
            child: _FilterChipButton(
              label: 'Tất cả',
              selected: selected == NotificationFilter.all,
              onTap: () => onSelect(NotificationFilter.all),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _FilterChipButton(
              label: 'Chưa đọc',
              selected: selected == NotificationFilter.unread,
              onTap: () => onSelect(NotificationFilter.unread),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChipButton extends StatelessWidget {
  const _FilterChipButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? ClinicColors.primary : ClinicColors.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: selected ? ClinicColors.primary : ClinicColors.border,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (selected) ...[
                    const Icon(
                      Icons.check_rounded,
                      size: 16,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 6),
                  ],
                  Flexible(
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      softWrap: true,
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight:
                            selected ? FontWeight.w700 : FontWeight.w500,
                        color: selected ? Colors.white : ClinicColors.ink,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
