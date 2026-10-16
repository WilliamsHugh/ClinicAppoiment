import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import 'booking_selection.dart';
import 'booking_confirmation_sheet.dart';
import 'data/appointment_repository.dart';
import 'widgets/appointment_card.dart';
import 'widgets/reschedule_sheet.dart';

class AppointmentsPage extends StatefulWidget {
  const AppointmentsPage({
    required this.tokenProvider,
    this.api,
    this.bookingSelection,
    this.refreshVersion = 0,
    super.key,
  });

  final TokenProvider tokenProvider;
  final ClinicApiClient? api;
  final BookingSelection? bookingSelection;
  final int refreshVersion;

  @override
  State<AppointmentsPage> createState() => _AppointmentsPageState();
}

class _AppointmentsPageState extends State<AppointmentsPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  late final AppointmentRepository _repo;
  late final ClinicApiClient _api;
  BookingSelection? _completedSelection;
  bool _openingConfirmation = false;
  int _loadRequest = 0;
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
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
    _repo = AppointmentRepository(_api);
    _load();
    if (widget.bookingSelection != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _confirmBooking());
    }
  }

  @override
  void didUpdateWidget(covariant AppointmentsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshVersion != widget.refreshVersion) {
      _tab.index = 0;
      _load();
    }
    if (oldWidget.bookingSelection != widget.bookingSelection &&
        widget.bookingSelection != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _confirmBooking());
    }
  }

  Future<void> _confirmBooking() async {
    final selection = widget.bookingSelection;
    if (!mounted ||
        selection == null ||
        selection == _completedSelection ||
        _openingConfirmation) {
      return;
    }
    _openingConfirmation = true;
    final booked = await showBookingConfirmationSheet(context,
        selection: selection, api: _api);
    if (!mounted) return;
    setState(() {
      _openingConfirmation = false;
      if (booked != null) _completedSelection = selection;
    });
    if (booked != null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã tạo lịch hẹn thành công.')));
      _tab.index = 0;
      await _load();
    }
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
    final request = ++_loadRequest;
    setState(() {
      _loading = true;
      _error = null;
    });
    final status = _statusForTab[_tab.index];
    try {
      final data = await _repo.fetch(status: status);
      if (mounted && request == _loadRequest) setState(() => _items = data);
    } on ApiException catch (error) {
      if (mounted && request == _loadRequest) {
        setState(() => _error = error.message);
      }
    } finally {
      if (mounted && request == _loadRequest) setState(() => _loading = false);
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
          isScrollable: false,
          indicatorSize: TabBarIndicatorSize.tab,
          labelPadding: EdgeInsets.zero,
          labelColor: ClinicColors.primary,
          unselectedLabelColor: ClinicColors.muted,
          indicatorColor: ClinicColors.primary,
          labelStyle:
              const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          tabs: _tabs.map((t) => Tab(text: t)).toList(),
        ),
      ),
      body: Column(
        children: [
          if (widget.bookingSelection case final selection?
              when selection != _completedSelection)
            Card(
              margin: const EdgeInsets.all(16),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(Icons.event_available_outlined),
                    const SizedBox(width: 12),
                    Expanded(
                        child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            '${selection.doctorName}, ${selection.displayTime}'),
                        TextButton(
                            onPressed: _confirmBooking,
                            child: const Text('Xem và xác nhận đặt lịch')),
                      ],
                    )),
                  ],
                ),
              ),
            ),
          Expanded(
            child: _loading
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
                              padding:
                                  const EdgeInsets.fromLTRB(16, 16, 16, 24),
                              itemCount: _items.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 12),
                              itemBuilder: (_, i) => AppointmentCard(
                                data: _items[i],
                                onCancel: () =>
                                    _cancel(_items[i]['id'].toString()),
                                onReschedule: () =>
                                    _reschedule(_items[i]['id'].toString()),
                              ),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
