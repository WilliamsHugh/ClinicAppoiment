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
      home: const AppointmentHomePage(),
    );
  }
}

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
        _appointments =
            (results[2] as Map<String, dynamic>)['items'] as List<dynamic>;
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
    final slots = await _api
        .get('/api/v1/doctors/$_selectedDoctorId/available-slots?date=$today');
    setState(() {
      _slots = slots as List<dynamic>;
      _selectedSlot = null;
    });
  }

  Future<void> _createAppointment() async {
    final slot = _selectedSlot;
    if (slot == null) return;

    try {
      await _api.post(
        '/api/v1/appointments',
        headers: {
          'Idempotency-Key': DateTime.now().microsecondsSinceEpoch.toString()
        },
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
    return Scaffold(
      appBar: AppBar(title: const Text('Patient App')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadInitialData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'Đặt lịch khám qua API Gateway',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 16),
                  _Section(
                    title: 'Chuyên khoa',
                    children: _specialties
                        .map(
                          (specialty) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(specialty['name'].toString()),
                            subtitle: Text(
                                (specialty['description'] ?? '').toString()),
                          ),
                        )
                        .toList(),
                  ),
                  _Section(
                    title: 'Bác sĩ',
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _selectedDoctorId,
                        decoration:
                            const InputDecoration(border: OutlineInputBorder()),
                        items: _doctors
                            .map(
                              (doctor) => DropdownMenuItem<String>(
                                value: doctor['id'].toString(),
                                child: Text(doctor['displayName'].toString()),
                              ),
                            )
                            .toList(),
                        onChanged: (value) async {
                          if (value == null) return;
                          setState(() => _selectedDoctorId = value);
                          await _loadSlots();
                        },
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _slots.map((slot) {
                          final selected =
                              _selectedSlot?['startAt'] == slot['startAt'];
                          return ChoiceChip(
                            label:
                                Text(_formatTime(slot['startAt'].toString())),
                            selected: selected,
                            onSelected: (_) => setState(() =>
                                _selectedSlot = slot as Map<String, dynamic>),
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed:
                            _selectedSlot == null ? null : _createAppointment,
                        child: const Text('Đặt lịch'),
                      ),
                    ],
                  ),
                  _Section(
                    title: 'Lịch hẹn của tôi',
                    children: _appointments.isEmpty
                        ? [const Text('Chưa có lịch hẹn.')]
                        : _appointments
                            .map(
                              (appointment) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(appointment['status'].toString()),
                                subtitle: Text(
                                    appointment['scheduledStartAt'].toString()),
                              ),
                            )
                            .toList(),
                  ),
                  if (_message.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_message),
                    ),
                ],
              ),
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }
}

class ClinicApiClient {
  const ClinicApiClient();

  Future<dynamic> get(String path) {
    return _send('GET', path);
  }

  Future<dynamic> post(String path,
      {required Map<String, dynamic> body, Map<String, String>? headers}) {
    return _send('POST', path, body: body, headers: headers);
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    final requestHeaders = {
      'Authorization': 'Bearer dev-token',
      'X-User-Id': 'user-patient-1',
      'X-Role': 'PATIENT',
      'Content-Type': 'application/json',
      ...?headers,
    };

    final uri = Uri.parse('$apiBaseUrl$path');
    final response = method == 'POST'
        ? await http.post(uri, headers: requestHeaders, body: jsonEncode(body))
        : await http.get(uri, headers: requestHeaders);

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400 || decoded['success'] != true) {
      final error = decoded['error'] as Map<String, dynamic>?;
      throw Exception(error?['message'] ?? 'Request failed');
    }
    return decoded['data'];
  }
}
