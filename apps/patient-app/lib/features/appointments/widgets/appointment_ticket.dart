import 'package:flutter/material.dart';

import '../../../core/api/clinic_api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/clinic_page_header.dart';
import '../../../shared/widgets/qr_ticket_card.dart';
import '../appointment_models.dart';
import '../data/appointment_repository.dart';

typedef AppointmentTicketBuilder = Widget Function(
    BuildContext context, PatientAppointment appointment);

class AppointmentTicketCard extends StatelessWidget {
  const AppointmentTicketCard({required this.appointment, super.key});
  final PatientAppointment appointment;

  @override
  Widget build(BuildContext context) {
    final specialtyName =
        appointment.specialty.trim().isNotEmpty &&
                appointment.specialty != 'Lịch khám'
            ? appointment.specialty
            : null;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        QrTicketCard(
          appointmentId: appointment.id,
          doctorName: appointment.doctorName,
          specialtyName: specialtyName,
          dateTimeLabel:
              '${appointment.displayDate} · ${appointment.displayTime} (giờ Việt Nam)',
          status: appointment.status,
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: ClinicColors.infoLight,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: ClinicColors.info.withValues(alpha: 0.35),
            ),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.verified_user_outlined,
                  size: 18, color: ClinicColors.info),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Mã QR chứa định danh lịch hẹn để lễ tân đối chiếu trạng thái trực tiếp trên hệ thống.',
                  style: TextStyle(
                    fontSize: 13,
                    color: ClinicColors.infoDark,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
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
      final doctorName = fresh.doctorName != 'Bác sĩ phụ trách'
          ? fresh.doctorName
          : widget.appointment.doctorName;
      final specialty = fresh.specialty != 'Lịch khám'
          ? fresh.specialty
          : widget.appointment.specialty;
      setState(() => _appointment = fresh.withNames(
          doctorName: doctorName,
          specialty: specialty,
          specialtyId: fresh.specialtyId ?? widget.appointment.specialtyId));
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
          backgroundColor: ClinicColors.scaffold,
          body: Column(
            children: [
              ClinicPageHeader(
                title: 'Vé khám',
                subtitle: 'Xuất trình mã QR tại quầy lễ tân',
                trailing: IconButton(
                  tooltip: 'Đóng vé',
                  style: IconButton.styleFrom(
                    foregroundColor: Colors.white,
                    disabledForegroundColor: Colors.white54,
                  ),
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ),
              Expanded(
                child: SafeArea(
                  top: false,
                  child: ListView(
                    primary: false,
                    controller: _scroll,
                    padding: const EdgeInsets.all(20),
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                      if (_loading)
                        Semantics(
                          label: 'Đang kiểm tra vé khám',
                          liveRegion: true,
                          child: Container(
                            height: 280,
                            decoration: BoxDecoration(
                              color: ClinicColors.surfaceSubtle,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: ClinicColors.border),
                            ),
                          ),
                        )
                      else if (_error != null)
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: ClinicColors.dangerLight,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: ClinicColors.danger.withValues(alpha: 0.35),
                            ),
                          ),
                          child: Column(
                            children: [
                              Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: ClinicColors.dangerDark,
                                ),
                              ),
                              const SizedBox(height: 12),
                              OutlinedButton(
                                onPressed: _load,
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size(0, 48),
                                  foregroundColor: ClinicColors.dangerDark,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: const Text('Thử lại vé'),
                              ),
                            ],
                          ),
                        )
                      else if (_appointment case final appointment?)
                        if (appointment.ticketAvailable(DateTime.now()))
                          widget.builder?.call(context, appointment) ??
                              AppointmentTicketCard(appointment: appointment)
                        else
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: ClinicColors.warningLight,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color:
                                    ClinicColors.warning.withValues(alpha: 0.35),
                              ),
                            ),
                            child: const Text(
                              'Lịch hẹn này chưa được xác nhận, đã kết thúc hoặc đã hủy. Hãy quay lại và tải lại danh sách.',
                              style: TextStyle(color: ClinicColors.warningDark),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}
