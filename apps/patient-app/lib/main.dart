import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:8080',
);

void main() {
  runApp(const PatientApp());
}

class PatientApp extends StatelessWidget {
  const PatientApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Patient App',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E)),
        useMaterial3: true,
      ),
      home: const PatientShell(),
    );
  }
}

// Shell with BottomNavigation for RECORD-006 + NOTIFY-005
class PatientShell extends StatefulWidget {
  const PatientShell({super.key});

  @override
  State<PatientShell> createState() => _PatientShellState();
}

class _PatientShellState extends State<PatientShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Patient App')),
      body: IndexedStack(
        index: _index,
        children: const [
          AppointmentHomePage(),
          MedicalRecordHistoryPage(),
          NotificationListPage(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.calendar_today), label: 'Đặt lịch'),
          NavigationDestination(icon: Icon(Icons.history), label: 'Hồ sơ khám'),
          NavigationDestination(icon: Icon(Icons.notifications), label: 'Thông báo'),
        ],
      ),
    );
  }
}

// ---------------- Booking Tab (existing) ----------------
class AppointmentHomePage extends StatefulWidget {
  const AppointmentHomePage({super.key});

  @override
  State<AppointmentHomePage> createState() => _AppointmentHomePageState();
}

class _AppointmentHomePageState extends State<AppointmentHomePage> {
  final ClinicApiClient _api = const ClinicApiClient();
  List<dynamic> _specialties = [];
  List<dynamic> _doctors = [];
  List<dynamic> _slots = [];
  List<dynamic> _appointments = [];
  String _selectedDoctorId = 'doctor-1';
  Map<String, dynamic>? _selectedSlot;
  String _message = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _api.get('/api/v1/specialties'),
        _api.get('/api/v1/doctors'),
        _api.get('/api/v1/appointments?patientId=patient-1'),
      ]);
      setState(() {
        _specialties = results[0] as List<dynamic>;
        _doctors = results[1] as List<dynamic>;
        _appointments = (results[2] as Map<String, dynamic>)['items'] as List<dynamic>;
        _message = '';
      });
      await _loadSlots();
    } catch (error) {
      setState(() => _message = error.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _loadSlots() async {
    final today = DateTime.now().toIso8601String().substring(0, 10);
    try {
      final slots = await _api.get('/api/v1/doctors/$_selectedDoctorId/available-slots?date=$today');
      setState(() {
        _slots = slots as List<dynamic>;
        _selectedSlot = null;
      });
    } catch (e) {
      setState(() => _message = e.toString());
    }
  }

  Future<void> _createAppointment() async {
    final slot = _selectedSlot;
    if (slot == null) return;
    try {
      await _api.post(
        '/api/v1/appointments',
        headers: {'Idempotency-Key': DateTime.now().microsecondsSinceEpoch.toString()},
        body: {
          'patientId': 'patient-1',
          'doctorId': _selectedDoctorId,
          'scheduledStartAt': slot['startAt'],
          'scheduledEndAt': slot['endAt'],
          'reason': 'Khám từ Patient App',
        },
      );
      setState(() => _message = 'Đã gửi yêu cầu đặt lịch');
      await _loadInitialData();
    } catch (error) {
      setState(() => _message = error.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _loadInitialData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Đặt lịch khám qua API Gateway', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 16),
          _Section(
            title: 'Chuyên khoa',
            children: _specialties.isEmpty
                ? [const Text('Chưa có chuyên khoa.', style: TextStyle(color: Colors.grey))]
                : _specialties.map((specialty) => ListTile(contentPadding: EdgeInsets.zero, title: Text(specialty['name'].toString()), subtitle: Text((specialty['description'] ?? '').toString()))).toList(),
          ),
          _Section(
            title: 'Bác sĩ',
            children: [
              DropdownButtonFormField<String>(
                initialValue: _doctors.any((d) => d['id'] == _selectedDoctorId) ? _selectedDoctorId : null,
                decoration: const InputDecoration(border: OutlineInputBorder()),
                items: _doctors.map((doctor) => DropdownMenuItem<String>(value: doctor['id'].toString(), child: Text(doctor['displayName'].toString()))).toList(),
                onChanged: (value) async {
                  if (value == null) return;
                  setState(() => _selectedDoctorId = value);
                  await _loadSlots();
                },
              ),
              const SizedBox(height: 12),
              if (_slots.isEmpty) const Text('Không có khung giờ trống hôm nay.'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _slots.map((slot) {
                  final selected = _selectedSlot?['startAt'] == slot['startAt'];
                  return ChoiceChip(
                    label: Text(_formatTime(slot['startAt'].toString())),
                    selected: selected,
                    onSelected: (_) => setState(() => _selectedSlot = slot as Map<String, dynamic>),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),
              FilledButton(onPressed: _selectedSlot == null ? null : _createAppointment, child: const Text('Đặt lịch')),
            ],
          ),
          _Section(
            title: 'Lịch hẹn của tôi',
            children: _appointments.isEmpty
                ? [const Text('Chưa có lịch hẹn.')]
                : _appointments.map((appointment) => ListTile(contentPadding: EdgeInsets.zero, title: Text(appointment['status'].toString()), subtitle: Text(appointment['scheduledStartAt'].toString()))).toList(),
          ),
          if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_message, style: const TextStyle(color: Color(0xFF155E75)))),
        ],
      ),
    );
  }

  String _formatTime(String value) {
    final date = DateTime.parse(value).toLocal();
    final hour = date.hour.toString().padLeft(2, '0');
    final minute = date.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}

// ---------------- Medical Record History (RECORD-006) ----------------
class MedicalRecordHistoryPage extends StatefulWidget {
  const MedicalRecordHistoryPage({super.key});

  @override
  State<MedicalRecordHistoryPage> createState() => _MedicalRecordHistoryPageState();
}

class _MedicalRecordHistoryPageState extends State<MedicalRecordHistoryPage> {
  final ClinicApiClient _api = const ClinicApiClient();
  List<dynamic> _records = [];
  bool _loading = true;
  String? _error;
  int _page = 1;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (refresh) {
      setState(() {
        _page = 1;
        _records = [];
        _hasMore = true;
      });
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Patient history via GET /api/v1/medical-records?patientId=patient-1&page=...
      final data = await _api.get('/api/v1/medical-records?patientId=patient-1&page=$_page&limit=20') as Map<String, dynamic>;
      final items = data['items'] as List<dynamic>;
      setState(() {
        _records = refresh ? items : [..._records, ...items];
        _hasMore = items.length == 20;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _records.isEmpty) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => _load(refresh: true), child: const Text('Thử lại')),
          ]),
        ),
      );
    }
    if (_records.isEmpty) {
      return Center(
        child: RefreshIndicator(
          onRefresh: () => _load(refresh: true),
          child: ListView(children: const [
            SizedBox(height: 80),
            Icon(Icons.folder_open, size: 48, color: Colors.grey),
            SizedBox(height: 12),
            Center(child: Text('Chưa có lịch sử khám.')),
          ]),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _records.length + (_hasMore ? 1 : 0),
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          if (index >= _records.length) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: TextButton(
                  onPressed: () {
                    setState(() => _page += 1);
                    _load();
                  },
                  child: const Text('Tải thêm'),
                ),
              ),
            );
          }
          final r = _records[index] as Map<String, dynamic>;
          return ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(r['diagnosis']?.toString().isNotEmpty == true ? r['diagnosis'].toString() : 'Kết quả khám #${r['id'].toString().substring(0, 8)}'),
            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Ngày: ${_formatDate(r['createdAt'].toString())} • Trạng thái: ${r['status']}'),
              if (r['symptoms'] != null) Text('Triệu chứng: ${r['symptoms']}', maxLines: 1, overflow: TextOverflow.ellipsis),
              if ((r['prescription'] as List?)?.isNotEmpty == true) Text('Đơn thuốc: ${(r['prescription'] as List).length} loại'),
            ]),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _openDetail(r),
          );
        },
      ),
    );
  }

  void _openDetail(Map<String, dynamic> record) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        builder: (_, controller) => SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            Text('Chi tiết kết quả khám', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            _DetailRow(label: 'Chẩn đoán', value: record['diagnosis']?.toString() ?? '—'),
            _DetailRow(label: 'Triệu chứng', value: record['symptoms']?.toString() ?? '—'),
            _DetailRow(label: 'Ghi chú', value: record['notes']?.toString() ?? '—'),
            _DetailRow(label: 'Điều trị', value: record['treatmentPlan']?.toString() ?? '—'),
            const SizedBox(height: 12),
            Text('Đơn thuốc', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ..._buildPrescription(record['prescription']),
            const SizedBox(height: 12),
            Text('ID lịch hẹn: ${record['appointmentId']}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
          ]),
        ),
      ),
    );
  }

  List<Widget> _buildPrescription(dynamic pres) {
    if (pres == null || (pres as List).isEmpty) return [const Text('Không có đơn thuốc.', style: TextStyle(color: Colors.grey))];
    return (pres as List).map((p) {
      final m = p as Map<String, dynamic>;
      return Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          title: Text(m['medicineName'].toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text('Liều: ${m['dosage']} • Tần suất: ${m['frequency']} • Thời gian: ${m['duration']}'),
        ),
      );
    }).toList();
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso).toLocal();
      return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    } catch (_) {
      return iso;
    }
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF64748B), fontSize: 12)),
        const SizedBox(height: 2),
        Text(value),
      ]),
    );
  }
}

// ---------------- Notification List (NOTIFY-005) ----------------
class NotificationListPage extends StatefulWidget {
  const NotificationListPage({super.key});

  @override
  State<NotificationListPage> createState() => _NotificationListPageState();
}

class _NotificationListPageState extends State<NotificationListPage> {
  final ClinicApiClient _api = const ClinicApiClient();
  List<dynamic> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await _api.get('/api/v1/notifications?page=1&limit=20') as Map<String, dynamic>;
      setState(() => _items = data['items'] as List<dynamic>);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _markRead(String id) async {
    try {
      await _api.patch('/api/v1/notifications/$id/read', body: {});
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Text(_error!), const SizedBox(height: 12), FilledButton(onPressed: _load, child: const Text('Thử lại'))]));
    }
    if (_items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(children: const [
          SizedBox(height: 80),
          Icon(Icons.notifications_none, size: 48, color: Colors.grey),
          SizedBox(height: 12),
          Center(child: Text('Chưa có thông báo.')),
        ]),
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
            leading: CircleAvatar(backgroundColor: unread ? const Color(0xFF0F766E) : Colors.grey[300], child: Icon(unread ? Icons.mark_email_unread : Icons.mark_email_read, color: Colors.white, size: 18)),
            title: Text(n['title'].toString(), style: TextStyle(fontWeight: unread ? FontWeight.w700 : FontWeight.w400)),
            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(n['message'].toString(), maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 4),
              Text(_formatDate(n['createdAt'].toString()), style: const TextStyle(fontSize: 12, color: Colors.grey)),
            ]),
            trailing: unread
                ? TextButton(onPressed: () => _markRead(n['id'].toString()), child: const Text('Đã đọc'))
                : const Icon(Icons.check, size: 18, color: Colors.green),
            onTap: () {
              // NOTIFY-005: điều hướng đến nội dung mà người nhận được phép xem
              final payload = n['payload'] as Map<String, dynamic>?;
              final appointmentId = payload?['appointmentId']?.toString() ?? payload?['id']?.toString();
              if (appointmentId != null) {
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

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          ...children,
        ]),
      ),
    );
  }
}

class ClinicApiClient {
  const ClinicApiClient();

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, {required Map<String, dynamic> body, Map<String, String>? headers}) => _send('POST', path, body: body, headers: headers);
  Future<dynamic> patch(String path, {Map<String, dynamic>? body, Map<String, String>? headers}) => _send('PATCH', path, body: body, headers: headers);

  Future<dynamic> _send(String method, String path, {Map<String, dynamic>? body, Map<String, String>? headers}) async {
    final requestHeaders = {
      'Authorization': 'Bearer dev-token',
      'X-User-Id': 'user-patient-1',
      'X-Role': 'PATIENT',
      'Content-Type': 'application/json',
      ...?headers,
    };
    final uri = Uri.parse('$apiBaseUrl$path');
    late http.Response response;
    if (method == 'POST') {
      response = await http.post(uri, headers: requestHeaders, body: jsonEncode(body));
    } else if (method == 'PATCH') {
      response = await http.patch(uri, headers: requestHeaders, body: body != null ? jsonEncode(body) : '{}');
    } else {
      response = await http.get(uri, headers: requestHeaders);
    }
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400 || decoded['success'] != true) {
      final error = decoded['error'] as Map<String, dynamic>?;
      throw Exception(error?['message'] ?? 'Request failed');
    }
    return decoded['data'];
  }
}
