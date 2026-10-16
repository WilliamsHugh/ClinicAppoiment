import 'package:flutter/material.dart';

import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../shared/widgets/async_states.dart';
import 'appointment_models.dart';
import 'booking_confirmation_sheet.dart';
import 'booking_selection.dart';
import 'data/appointment_repository.dart';
import 'widgets/appointment_card.dart';
import 'widgets/appointment_ticket.dart';
import 'widgets/reschedule_sheet.dart';

class AppointmentsPage extends StatefulWidget {
  const AppointmentsPage(
      {required this.tokenProvider,
      this.api,
      this.bookingSelection,
      this.refreshVersion = 0,
      this.ticketBuilder,
      super.key});
  final TokenProvider tokenProvider;
  final ClinicApiClient? api;
  final BookingSelection? bookingSelection;
  final int refreshVersion;
  final AppointmentTicketBuilder? ticketBuilder;
  @override
  State<AppointmentsPage> createState() => _AppointmentsPageState();
}

class _AppointmentsPageState extends State<AppointmentsPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  late ClinicApiClient _api;
  late AppointmentRepository _repo;
  BookingSelection? _completedSelection;
  bool _openingConfirmation = false;
  bool _openingAction = false;
  bool _openingTicket = false;
  int _loadRequest = 0;
  RequestCancellation? _cancellation;
  bool _loading = true;
  String? _error;
  String? _notice;
  List<PatientAppointment> _items = [];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: appointmentTabLabels.length, vsync: this)
      ..addListener(_onTabChanged);
    _resetApi();
    _load();
    if (widget.bookingSelection != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _confirmBooking());
    }
  }

  void _resetApi() {
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
    _repo = AppointmentRepository(_api);
  }

  @override
  void didUpdateWidget(covariant AppointmentsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api ||
        oldWidget.tokenProvider != widget.tokenProvider) {
      _cancellation?.cancel();
      ++_loadRequest;
      _items = [];
      _notice = null;
      _resetApi();
      _load();
    } else if (oldWidget.refreshVersion != widget.refreshVersion) {
      _tab.index = 0;
      _load();
    }
    if (oldWidget.bookingSelection != widget.bookingSelection &&
        widget.bookingSelection != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _confirmBooking());
    }
  }

  @override
  void dispose() {
    _cancellation?.cancel();
    _tab.removeListener(_onTabChanged);
    _tab.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _load() async {
    _cancellation?.cancel();
    final cancellation = _cancellation = RequestCancellation();
    final request = ++_loadRequest;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _repo.fetchAll(cancellation: cancellation);
      if (mounted && request == _loadRequest) setState(() => _items = data);
    } catch (error) {
      if (mounted && request == _loadRequest) {
        setState(() => _error = appointmentError(error));
      }
    } finally {
      if (mounted && request == _loadRequest) setState(() => _loading = false);
    }
  }

  Future<void> _confirmBooking() async {
    final selection = widget.bookingSelection;
    if (!mounted ||
        selection == null ||
        selection == _completedSelection ||
        _openingConfirmation ||
        _openingAction ||
        _openingTicket) {
      return;
    }
    setState(() => _openingConfirmation = true);
    final booked = await showBookingConfirmationSheet(context,
        selection: selection, api: _api);
    if (!mounted) return;
    setState(() {
      _openingConfirmation = false;
      if (booked != null) {
        _completedSelection = selection;
        _notice = 'Đã tạo lịch hẹn thành công.';
      }
    });
    if (booked != null) {
      _tab.index = 0;
      await _load();
    }
  }

  Future<void> _change(PatientAppointment appointment,
      {bool cancel = false}) async {
    if (_openingAction ||
        _openingTicket ||
        _openingConfirmation ||
        _loading ||
        _error != null ||
        !appointment.canModify) {
      return;
    }
    setState(() {
      _openingAction = true;
      _notice = null;
    });
    final repository = _repo;
    final result = await showAppointmentChangeSheet(context,
        appointment: appointment, repository: repository, cancel: cancel);
    if (!mounted) return;
    if (repository != _repo) {
      setState(() => _openingAction = false);
      return;
    }
    setState(() {
      _openingAction = false;
      if (result?.appointment case final updated?) {
        _items = _items
            .map((item) => item.id == updated.id
                ? updated.withNames(
                    doctorName: item.doctorName, specialty: item.specialty)
                : item)
            .toList();
        _notice = cancel ? 'Đã hủy lịch hẹn.' : 'Đã đổi lịch thành công.';
      }
    });
    if (result?.appointment != null) _tab.index = cancel ? 2 : 0;
    if (result?.requiresRefresh == true) await _load();
  }

  Future<void> _ticket(PatientAppointment appointment) async {
    if (_openingAction ||
        _openingTicket ||
        _openingConfirmation ||
        _loading ||
        _error != null ||
        !appointment.ticketAvailable(DateTime.now())) {
      return;
    }
    setState(() => _openingTicket = true);
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => AppointmentTicketSheet(
            appointment: appointment,
            repository: _repo,
            builder: widget.ticketBuilder));
    if (!mounted) return;
    setState(() => _openingTicket = false);
    await _load();
  }

  Widget _skeleton() => Semantics(
      label: 'Đang tải lịch hẹn',
      liveRegion: true,
      child: Column(
        children: List.generate(
            3,
            (_) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Container(
                      height: 112,
                      decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12))),
                )),
      ));

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final tab = AppointmentTab.values[_tab.index];
    final items = _items.where((item) => item.belongsTo(tab, now)).toList()
      ..sort((a, b) => tab == AppointmentTab.upcoming
          ? a.startAt.compareTo(b.startAt)
          : b.startAt.compareTo(a.startAt));
    final enabled = !_loading &&
        _error == null &&
        !_openingAction &&
        !_openingConfirmation &&
        !_openingTicket;
    return Scaffold(
      appBar: AppBar(
          title: const Text('Lịch hẹn'),
          actions: [
            IconButton(
                tooltip: 'Tải lại lịch hẹn',
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh)),
          ],
          bottom: TabBar(
              controller: _tab,
              isScrollable: false,
              indicatorSize: TabBarIndicatorSize.tab,
              labelPadding: EdgeInsets.zero,
              tabs: appointmentTabLabels
                  .map((label) => Tab(text: label))
                  .toList())),
      body: Column(children: [
        if (widget.bookingSelection case final selection?
            when selection != _completedSelection)
          Card(
              margin: const EdgeInsets.all(16),
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(children: [
                    Text('${selection.doctorName}, ${selection.displayTime}'),
                    TextButton(
                        onPressed: _confirmBooking,
                        child: const Text('Xem và xác nhận đặt lịch')),
                  ]))),
        Expanded(
            child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                    padding: const EdgeInsets.all(16),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      if (_notice != null)
                        Semantics(
                            liveRegion: true,
                            child: Padding(
                                padding: const EdgeInsets.only(bottom: 16),
                                child: Text(_notice!))),
                      if (_error != null) ...[
                        AppErrorState(message: _error!, onRetry: _load),
                        if (_items.isNotEmpty)
                          const Text(
                              'Dữ liệu có thể đã thay đổi. Tải lại thành công trước khi tiếp tục thao tác.'),
                      ],
                      if (_loading)
                        _skeleton()
                      else if (items.isEmpty && _error == null)
                        Column(children: [
                          AppEmptyState(
                              title: 'Chưa có lịch hẹn',
                              message:
                                  'Chưa có dữ liệu trong mục ${appointmentTabLabels[_tab.index]}.',
                              icon: Icons.calendar_month_outlined),
                          TextButton(
                              onPressed: _load,
                              child: const Text('Kiểm tra lại')),
                        ])
                      else
                        ...items.map((item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: AppointmentCard(
                              appointment: item,
                              enabled: enabled,
                              onCancel: () => _change(item, cancel: true),
                              onReschedule: () => _change(item),
                              onTicket: () => _ticket(item),
                            ))),
                    ]))),
      ]),
    );
  }
}
