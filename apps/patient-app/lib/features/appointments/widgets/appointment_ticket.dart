import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/api/clinic_api_client.dart';
import '../appointment_models.dart';
import '../data/appointment_repository.dart';
import 'status_chip.dart';

typedef AppointmentTicketBuilder = Widget Function(
    BuildContext context, PatientAppointment appointment);

/// Local QR rendering uses the library; TV1's QrTicketCard can replace this builder.
class AppointmentTicketCard extends StatelessWidget {
  const AppointmentTicketCard({required this.appointment, super.key});
  final PatientAppointment appointment;
  @override
  Widget build(BuildContext context) => Column(children: [
        Text(appointment.doctorName,
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(
            '${appointment.displayDate} · ${appointment.displayTime} (giờ Việt Nam)',
            textAlign: TextAlign.center),
        const SizedBox(height: 12),
        StatusChip(status: appointment.status),
        const SizedBox(height: 20),
        LayoutBuilder(builder: (_, constraints) {
          final size =
              constraints.maxWidth < 240 ? constraints.maxWidth : 240.0;
          return QrImageView(
            data: appointment.id,
            version: QrVersions.auto,
            size: size,
            padding: EdgeInsets.all(size / 6),
            backgroundColor: Colors.white,
            gapless: false,
            errorCorrectionLevel: QrErrorCorrectLevel.M,
            semanticsLabel: 'Mã QR lịch hẹn để xuất trình cho lễ tân',
            errorStateBuilder: (_, __) =>
                const Text('Không thể tạo mã QR. Vui lòng tải lại vé.'),
          );
        }),
        const SizedBox(height: 16),
        const Text(
            'Xuất trình mã QR cho lễ tân. Trạng thái lịch hẹn sẽ được kiểm tra trước khi check-in.',
            textAlign: TextAlign.center),
      ]);
}

class AppointmentTicketSheet extends StatefulWidget {
  const AppointmentTicketSheet(
      {required this.appointment,
      required this.repository,
      this.builder,
      super.key});
  final PatientAppointment appointment;
  final AppointmentRepository repository;
  final AppointmentTicketBuilder? builder;
  @override
  State<AppointmentTicketSheet> createState() => _AppointmentTicketSheetState();
}

class _AppointmentTicketSheetState extends State<AppointmentTicketSheet> {
  final _scroll = ScrollController(keepScrollOffset: false);
  PatientAppointment? _appointment;
  bool _loading = true;
  String? _error;
  int _request = 0;
  RequestCancellation? _cancellation;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _cancellation?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    _cancellation?.cancel();
    final cancellation = _cancellation = RequestCancellation();
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
      _appointment = null;
    });
    try {
      final fresh = await widget.repository
          .detail(widget.appointment.id, cancellation: cancellation);
      if (!mounted || request != _request) return;
      setState(() => _appointment = fresh.withNames(
          doctorName: widget.appointment.doctorName,
          specialty: widget.appointment.specialty));
    } catch (error) {
      if (mounted && request == _request) {
        setState(() => _error = appointmentError(error));
      }
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        height: MediaQuery.sizeOf(context).height,
        child: Scaffold(
            appBar: AppBar(
                automaticallyImplyLeading: false,
                title: const Text('Vé khám'),
                actions: [
                  IconButton(
                      tooltip: 'Đóng vé',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close)),
                ]),
            body: SafeArea(
                child: ListView(
                    primary: false,
                    controller: _scroll,
                    padding: const EdgeInsets.all(20),
                    children: [
                  if (_loading)
                    Semantics(
                        label: 'Đang kiểm tra vé khám',
                        liveRegion: true,
                        child: Container(
                            height: 240,
                            color: Theme.of(context)
                                .colorScheme
                                .surfaceContainerHighest))
                  else if (_error != null)
                    Column(children: [
                      Text(_error!),
                      TextButton(
                          onPressed: _load, child: const Text('Thử lại vé'))
                    ])
                  else if (_appointment case final appointment?)
                    if (appointment.ticketAvailable(DateTime.now()))
                      widget.builder?.call(context, appointment) ??
                          AppointmentTicketCard(appointment: appointment)
                    else
                      const Text(
                          'Lịch hẹn này chưa được xác nhận, đã kết thúc hoặc đã hủy. Hãy quay lại và tải lại danh sách.'),
                ]))),
      );
}
