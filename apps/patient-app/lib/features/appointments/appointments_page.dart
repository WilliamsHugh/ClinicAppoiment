import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import 'data/appointment_repository.dart';
import 'widgets/appointment_card.dart';
import 'widgets/reschedule_sheet.dart';

class AppointmentsPage extends StatefulWidget {
  const AppointmentsPage({required this.tokenProvider, this.api, super.key});

  final TokenProvider tokenProvider;
  final ClinicApiClient? api;

  @override
  State<AppointmentsPage> createState() => _AppointmentsPageState();
}

class _AppointmentsPageState extends State<AppointmentsPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  late final AppointmentRepository _repo;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

  // tabs: Tất cả, Chờ xác nhận (PENDING), Đã xác nhận (CONFIRMED), Hoàn thành (COMPLETED)
  final _tabs = const ['Tất cả', 'Chờ xác nhận', 'Đã xác nhận', 'Hoàn thành'];
  final _statusForTab = const [null, 'PENDING', 'CONFIRMED', 'COMPLETED'];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: _tabs.length, vsync: this);
    _tab.addListener(_onTabChanged);
    _repo = AppointmentRepository(
      widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider),
    );
    _load();
  }

  @override
  void dispose() {
    _tab.removeListener(_onTabChanged);
    _tab.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (_tab.indexIsChanging) return;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final status = _statusForTab[_tab.index];
    try {
      final data = await _repo.fetch(status: status);
      if (mounted) setState(() => _items = data);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _cancel(String id) async {
    final confirm = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
              title: const Text('Hủy lịch hẹn?'),
              content: const Text(
                  'Bạn có chắc muốn hủy? Thao tác này không thể hoàn tác nếu đã qua xác nhận.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Không')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Hủy lịch')),
              ],
            ));
    if (confirm != true) return;
    try {
      await _repo.cancel(id, reason: 'Patient cancelled via app');
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Đã hủy lịch')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Lỗi hủy: $e')));
    }
  }

  void _reschedule(String id) {
    showModalBottomSheet(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (_) => RescheduleSheet(onConfirm: (start, end) async {
              try {
                await _repo.reschedule(id, start, end, reason: 'Đổi giờ');
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Đã đổi lịch thành công')));
                _load();
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text('Lỗi đổi lịch: $e')));
              }
            }));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      appBar: AppBar(
        backgroundColor: ClinicColors.scaffold,
        title: const Text('Lịch hẹn',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: ClinicColors.ink)),
        bottom: TabBar(
          controller: _tab,
          isScrollable: true,
          labelColor: ClinicColors.primary,
          unselectedLabelColor: ClinicColors.muted,
          indicatorColor: ClinicColors.primary,
          labelStyle:
              const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          tabs: _tabs.map((t) => Tab(text: t)).toList(),
        ),
      ),
      body: _loading
          ? const AppLoadingState(label: 'Đang tải lịch hẹn...')
          : _error != null
              ? AppErrorState(message: _error!, onRetry: _load)
              : _items.isEmpty
                  ? AppEmptyState(
                      title: 'Chưa có lịch hẹn',
                      message: 'Trạng thái ${_tabs[_tab.index]} trống',
                      icon: Icons.calendar_month_outlined,
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (_, i) => AppointmentCard(
                          data: _items[i],
                          onCancel: () => _cancel(_items[i]['id'].toString()),
                          onReschedule: () =>
                              _reschedule(_items[i]['id'].toString()),
                        ),
                      ),
                    ),
    );
  }
}
