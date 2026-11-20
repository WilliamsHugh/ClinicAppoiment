import 'package:flutter/material.dart';

import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/clinic_page_header.dart';
import '../../shared/widgets/clinic_search_field.dart';
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
  final _searchController = TextEditingController();
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
  String _query = '';
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
      _query = '';
      _searchController.clear();
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
    _searchController.dispose();
    _tab.removeListener(_onTabChanged);
    _tab.dispose();
    super.dispose();
  }

  void _onTabChanged() {
    if (mounted) setState(() {});
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() => _query = '');
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
                    doctorName: item.doctorName,
                    specialty: item.specialty,
                    specialtyId: item.specialtyId)
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
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Container(
                      height: 124,
                      decoration: BoxDecoration(
                          color: ClinicColors.card,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: ClinicColors.border)),
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            height: 16,
                            width: 180,
                            decoration: BoxDecoration(
                              color: ClinicColors.surfaceSubtle,
                              borderRadius: BorderRadius.circular(6),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Container(
                            height: 12,
                            width: 120,
                            decoration: BoxDecoration(
                              color: ClinicColors.surfaceSubtle,
                              borderRadius: BorderRadius.circular(6),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Container(
                            height: 36,
                            decoration: BoxDecoration(
                              color: ClinicColors.surfaceSubtle,
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                        ],
                      )),
                )),
      ));

  List<PatientAppointment> _filterItems(List<PatientAppointment> tabItems) {
    final keyword = _query.trim().toLowerCase();
    if (keyword.isEmpty) return tabItems;
    return tabItems.where((item) {
      final doctor = item.doctorName.toLowerCase();
      final specialty = item.specialty.toLowerCase();
      final reason = (item.reason ?? '').toLowerCase();
      return doctor.contains(keyword) ||
          specialty.contains(keyword) ||
          reason.contains(keyword);
    }).toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final tab = AppointmentTab.values[_tab.index];
    final tabItems = _items.where((item) => item.belongsTo(tab, now)).toList()
      ..sort((a, b) => tab == AppointmentTab.upcoming
          ? a.startAt.compareTo(b.startAt)
          : b.startAt.compareTo(a.startAt));
    final items = _filterItems(tabItems);
    final enabled = !_loading &&
        _error == null &&
        !_openingAction &&
        !_openingConfirmation &&
        !_openingTicket;

    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      resizeToAvoidBottomInset: false,
      body: Column(children: [
        ClinicPageHeader(
          title: 'Lịch hẹn',
          subtitle: 'Theo dõi lịch khám, vé QR và đổi lịch',
          padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
          trailing: IconButton(
            tooltip: 'Tải lại lịch hẹn',
            onPressed: _loading ? null : _load,
            style: IconButton.styleFrom(
              foregroundColor: Colors.white,
              disabledForegroundColor: Colors.white54,
            ),
            icon: const Icon(Icons.refresh),
          ),
          bottom: TabBar(
            controller: _tab,
            isScrollable: false,
            indicatorSize: TabBarIndicatorSize.tab,
            labelPadding: EdgeInsets.zero,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: Colors.white,
            indicatorWeight: 3,
            indicatorPadding: const EdgeInsets.symmetric(horizontal: 16),
            dividerColor: Colors.transparent,
            labelStyle: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
            tabs: appointmentTabLabels
                .map((label) => Tab(
                      child: Text(
                        label,
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ))
                .toList(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClinicSearchField(
                controller: _searchController,
                hintText: 'Tìm bác sĩ, chuyên khoa, lý do...',
                semanticsLabel: 'Tìm lịch hẹn trong danh sách đã tải',
                onChanged: (value) => setState(() => _query = value),
                onClear: () => setState(() => _query = ''),
              ),
              const SizedBox(height: 6),
              const Text(
                'Lọc cục bộ trong danh sách đã tải theo bác sĩ, chuyên khoa hoặc lý do.',
                style: TextStyle(
                  fontSize: 12,
                  color: ClinicColors.muted,
                ),
              ),
            ],
          ),
        ),
        if (widget.bookingSelection case final selection?
            when selection != _completedSelection)
          Container(
            margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: ClinicColors.primarySoft,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: ClinicColors.primary.withValues(alpha: 0.3),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${selection.doctorName}, ${selection.displayTime}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: ClinicColors.ink,
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: _confirmBooking,
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 48),
                    backgroundColor: ClinicColors.card,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text('Xem và xác nhận đặt lịch'),
                ),
              ],
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                  16, 8, 16, 20 + MediaQuery.viewInsetsOf(context).bottom),
              physics: const AlwaysScrollableScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_notice != null)
                    Semantics(
                      liveRegion: true,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: ClinicColors.successLight,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: ClinicColors.success.withValues(alpha: 0.35),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.check_circle_outline,
                              size: 18,
                              color: ClinicColors.success,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _notice!,
                                style: const TextStyle(
                                  color: ClinicColors.successDark,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (_error != null) ...[
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: ClinicColors.card,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ClinicColors.border),
                      ),
                      child: AppErrorState(message: _error!, onRetry: _load),
                    ),
                    if (_items.isNotEmpty)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 12),
                        child: Text(
                          'Dữ liệu có thể đã thay đổi. Tải lại thành công trước khi tiếp tục thao tác.',
                          style: TextStyle(
                            fontSize: 13,
                            color: ClinicColors.muted,
                          ),
                        ),
                      ),
                  ],
                  if (_loading)
                    _skeleton()
                  else if (tabItems.isEmpty && _error == null)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      decoration: BoxDecoration(
                        color: ClinicColors.card,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ClinicColors.border),
                      ),
                      child: Column(
                        children: [
                          AppEmptyState(
                            title: 'Chưa có lịch hẹn',
                            message:
                                'Chưa có dữ liệu trong mục ${appointmentTabLabels[_tab.index]}.',
                            icon: Icons.calendar_month_outlined,
                          ),
                          TextButton(
                            onPressed: _load,
                            style: TextButton.styleFrom(
                              minimumSize: const Size(0, 48),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: const Text('Kiểm tra lại'),
                          ),
                        ],
                      ),
                    )
                  else if (items.isEmpty && _error == null)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      decoration: BoxDecoration(
                        color: ClinicColors.card,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ClinicColors.border),
                      ),
                      child: Column(
                        children: [
                          AppEmptyState(
                            title: 'Không tìm thấy lịch hẹn phù hợp',
                            message:
                                'Không có kết quả cho "${_query.trim()}" trong mục ${appointmentTabLabels[_tab.index]}.',
                            icon: Icons.search_off_outlined,
                          ),
                          OutlinedButton.icon(
                            onPressed: _clearSearch,
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(0, 48),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            icon: const Icon(Icons.close, size: 18),
                            label: const Text('Xóa tìm kiếm'),
                          ),
                        ],
                      ),
                    )
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
                ],
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
