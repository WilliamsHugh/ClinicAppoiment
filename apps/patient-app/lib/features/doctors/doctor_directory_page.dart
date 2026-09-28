import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/pagination_controls.dart';
import 'doctor_models.dart';

class DoctorDirectoryPage extends StatefulWidget {
  const DoctorDirectoryPage({super.key, this.tokenProvider, this.apiClient, this.onSlotSelected});

  final TokenProvider? tokenProvider;
  final ClinicApiClient? apiClient;
  final void Function(Doctor doctor, DoctorSlot slot)? onSlotSelected;

  @override
  State<DoctorDirectoryPage> createState() => _DoctorDirectoryPageState();
}

class _DoctorDirectoryPageState extends State<DoctorDirectoryPage> {
  ClinicApiClient? _api;
  final _specialtySearch = TextEditingController();
  final _doctorSearch = TextEditingController();
  List<Specialty> _specialties = const [];
  List<Doctor> _doctors = const [];
  List<DoctorSlot> _slots = const [];
  PageMetadata? _specialtyPagination;
  PageMetadata? _doctorPagination;
  Specialty? _selectedSpecialty;
  Doctor? _selectedDoctor;
  DoctorSlot? _selectedSlot;
  String _selectedDate = clinicDate(DateTime.now());
  int _specialtyPage = 1;
  int _doctorPage = 1;
  bool _loadingDirectory = false;
  bool _loadingDetail = false;
  bool _loadingSlots = false;
  ApiException? _directoryError;
  ApiException? _detailError;
  ApiException? _slotError;
  int _directoryRequest = 0;
  int _detailRequest = 0;
  int _slotRequest = 0;

  @override
  void initState() {
    super.initState();
    _api = widget.apiClient ?? (widget.tokenProvider == null
        ? null
        : ClinicApiClient(tokenProvider: widget.tokenProvider!));
    if (_api != null) _loadDirectory();
  }

  @override
  void didUpdateWidget(covariant DoctorDirectoryPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.apiClient != widget.apiClient || oldWidget.tokenProvider != widget.tokenProvider) {
      _api = widget.apiClient ?? (widget.tokenProvider == null
          ? null
          : ClinicApiClient(tokenProvider: widget.tokenProvider!));
      if (_api != null) _loadDirectory();
    }
  }

  @override
  void dispose() {
    _specialtySearch.dispose();
    _doctorSearch.dispose();
    super.dispose();
  }

  List<T> _items<T>(ApiResponse response, T Function(Map<String, dynamic>) parse) {
    final data = response.data as Map<String, dynamic>;
    final items = data['items'] as List<dynamic>;
    return items.map((item) => parse(item as Map<String, dynamic>)).toList(growable: false);
  }

  ApiException _unexpected(Object error) => error is ApiException
      ? error
      : const ApiException(code: 'INVALID_RESPONSE', message: 'Không thể đọc dữ liệu bác sĩ.');

  Future<void> _loadDirectory() async {
    final api = _api;
    if (api == null) return;
    final request = ++_directoryRequest;
    setState(() { _loadingDirectory = true; _directoryError = null; });
    try {
      final results = await Future.wait([
        api.get('/api/v1/specialties', query: {
          'page': _specialtyPage, 'limit': 20, 'q': _specialtySearch.text.trim(), 'isActive': true,
        }),
        api.get('/api/v1/doctors', query: {
          'page': _doctorPage, 'limit': 20, 'q': _doctorSearch.text.trim(),
          'specialtyId': _selectedSpecialty?.id, 'isActive': true,
        }),
      ]);
      if (!mounted || request != _directoryRequest) return;
      setState(() {
        _specialties = _items(results[0], Specialty.fromJson);
        _doctors = _items(results[1], Doctor.fromJson);
        _specialtyPagination = results[0].pagination;
        _doctorPagination = results[1].pagination;
      });
    } catch (error) {
      if (mounted && request == _directoryRequest) setState(() => _directoryError = _unexpected(error));
    } finally {
      if (mounted && request == _directoryRequest) setState(() => _loadingDirectory = false);
    }
  }

  Future<void> _selectDoctor(Doctor doctor) async {
    final api = _api;
    if (api == null) return;
    final request = ++_detailRequest;
    setState(() {
      _selectedDoctor = doctor;
      _selectedSlot = null;
      _loadingDetail = true;
      _detailError = null;
    });
    try {
      final response = await api.get('/api/v1/doctors/${doctor.id}');
      if (!mounted || request != _detailRequest) return;
      setState(() => _selectedDoctor = Doctor.fromJson(response.data as Map<String, dynamic>));
      await _loadSlots();
    } catch (error) {
      if (mounted && request == _detailRequest) setState(() => _detailError = _unexpected(error));
    } finally {
      if (mounted && request == _detailRequest) setState(() => _loadingDetail = false);
    }
  }

  Future<void> _loadSlots() async {
    final doctor = _selectedDoctor;
    final api = _api;
    if (doctor == null || api == null) return;
    final request = ++_slotRequest;
    setState(() { _loadingSlots = true; _slotError = null; _selectedSlot = null; });
    try {
      final response = await api.get('/api/v1/doctors/${doctor.id}/available-slots', query: {
        'date': _selectedDate,
      });
      if (!mounted || request != _slotRequest) return;
      setState(() => _slots = (response.data as List<dynamic>)
          .map((item) => DoctorSlot.fromJson(item as Map<String, dynamic>))
          .toList(growable: false));
    } catch (error) {
      if (mounted && request == _slotRequest) setState(() => _slotError = _unexpected(error));
    } finally {
      if (mounted && request == _slotRequest) setState(() => _loadingSlots = false);
    }
  }

  Future<void> _chooseDate() async {
    final first = DateTime.parse(clinicDate(DateTime.now()));
    final chosen = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(_selectedDate),
      firstDate: first,
      lastDate: first.add(const Duration(days: 365)),
      helpText: 'Chọn ngày khám (giờ Việt Nam)',
    );
    if (chosen == null || !mounted) return;
    setState(() => _selectedDate = '${chosen.year.toString().padLeft(4, '0')}-${chosen.month.toString().padLeft(2, '0')}-${chosen.day.toString().padLeft(2, '0')}');
    await _loadSlots();
  }

  void _chooseSpecialty(Specialty? specialty) {
    setState(() { _selectedSpecialty = specialty; _doctorPage = 1; _selectedDoctor = null; _slots = const []; });
    _loadDirectory();
  }

  @override
  Widget build(BuildContext context) {
    if (_api == null) {
      return const AppErrorState(message: 'Không thể truy cập phiên đăng nhập để tải danh sách bác sĩ.');
    }
    return RefreshIndicator(
      onRefresh: _loadDirectory,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Chuyên khoa', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(
              controller: _specialtySearch,
              decoration: const InputDecoration(labelText: 'Tìm chuyên khoa', prefixIcon: Icon(Icons.search)),
              onSubmitted: (_) { _specialtyPage = 1; _loadDirectory(); },
            )),
            IconButton(tooltip: 'Tìm chuyên khoa', onPressed: () { _specialtyPage = 1; _loadDirectory(); }, icon: const Icon(Icons.arrow_forward)),
          ]),
          if (_directoryError != null) AppErrorState(
            message: _directoryError!.message, requestId: _directoryError!.requestId, onRetry: _loadDirectory,
          ) else if (_loadingDirectory && _specialties.isEmpty && _doctors.isEmpty)
            const AppLoadingState(label: 'Đang tải chuyên khoa và bác sĩ...')
          else ...[
            if (_specialties.isEmpty) const Padding(
              padding: EdgeInsets.symmetric(vertical: 16), child: Text('Chưa có chuyên khoa phù hợp.'),
            ),
            Wrap(spacing: 8, runSpacing: 8, children: [
              ChoiceChip(label: const Text('Tất cả'), selected: _selectedSpecialty == null,
                onSelected: (_) => _chooseSpecialty(null)),
              ..._specialties.map((item) => ChoiceChip(label: Text(item.name),
                selected: _selectedSpecialty?.id == item.id,
                onSelected: (_) => _chooseSpecialty(item))),
            ]),
            if (_specialtyPagination != null) Padding(
              padding: const EdgeInsets.only(top: 8),
              child: PaginationControls(page: _specialtyPage, limit: _specialtyPagination!.limit,
                total: _specialtyPagination!.total, onPageChanged: (page) { _specialtyPage = page; _loadDirectory(); }),
            ),
          ],
          const SizedBox(height: 24),
          Text('Bác sĩ', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(
              controller: _doctorSearch,
              decoration: const InputDecoration(labelText: 'Tìm bác sĩ', prefixIcon: Icon(Icons.search)),
              onSubmitted: (_) { _doctorPage = 1; _loadDirectory(); },
            )),
            IconButton(tooltip: 'Tìm bác sĩ', onPressed: () { _doctorPage = 1; _loadDirectory(); }, icon: const Icon(Icons.arrow_forward)),
          ]),
          if (_loadingDirectory && _doctors.isNotEmpty) const LinearProgressIndicator(),
          if (!_loadingDirectory && _doctors.isEmpty) const AppEmptyState(
            title: 'Chưa có bác sĩ', message: 'Thử chuyên khoa hoặc từ khóa khác.', icon: Icons.medical_services_outlined,
          ),
          ..._doctors.map((doctor) => Card(
            child: ListTile(
              title: Text(doctor.displayName),
              subtitle: Text(_specialties.where((item) => item.id == doctor.specialtyId)
                  .map((item) => item.name).firstOrNull ?? 'Xem chuyên khoa và lịch khám'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _selectDoctor(doctor),
            ),
          )),
          if (_doctorPagination != null) PaginationControls(
            page: _doctorPage, limit: _doctorPagination!.limit, total: _doctorPagination!.total,
            onPageChanged: (page) { _doctorPage = page; _loadDirectory(); },
          ),
          if (_selectedDoctor != null) ...[
            const SizedBox(height: 24),
            Text('Chi tiết bác sĩ', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Card(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_selectedDoctor!.displayName, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(_selectedDoctor!.bio?.isNotEmpty == true ? _selectedDoctor!.bio! : 'Chưa có giới thiệu chuyên môn.'),
                if (_loadingDetail) const LinearProgressIndicator(),
                if (_detailError != null) AppErrorState(message: _detailError!.message, onRetry: () => _selectDoctor(_selectedDoctor!)),
                const SizedBox(height: 16),
                OutlinedButton.icon(onPressed: _chooseDate, icon: const Icon(Icons.calendar_month),
                  label: Text('Ngày khám: $_selectedDate')),
                const SizedBox(height: 10),
                if (_loadingSlots) const AppLoadingState(label: 'Đang tải khung giờ...')
                else if (_slotError != null) AppErrorState(
                  message: _slotError!.message, requestId: _slotError!.requestId, onRetry: _loadSlots,
                ) else if (_slots.isEmpty) const Text('Ngày này chưa có khung giờ phù hợp.')
                else Wrap(spacing: 8, runSpacing: 8, children: _slots.map((slot) => ChoiceChip(
                  label: Text('${clinicTime(slot.startAt)}–${clinicTime(slot.endAt)}'),
                  selected: _selectedSlot?.startAt == slot.startAt,
                  onSelected: (_) {
                    setState(() => _selectedSlot = slot);
                    widget.onSlotSelected?.call(_selectedDoctor!, slot);
                  },
                )).toList()),
                if (_selectedSlot != null) const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text('Khung giờ đã chọn. Tình trạng còn trống sẽ được xác nhận khi tạo lịch hẹn.'),
                ),
              ]),
            )),
          ],
        ],
      ),
    );
  }
}
