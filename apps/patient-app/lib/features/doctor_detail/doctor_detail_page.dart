import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../home/data/doctor_repository.dart';
import 'data/slot_repository.dart';
import 'widgets/date_selector.dart';
import 'widgets/doctor_hero.dart';
import 'widgets/time_selector.dart';

class DoctorDetailPage extends StatefulWidget {
  const DoctorDetailPage({
    required this.doctorId,
    required this.tokenProvider,
    this.api,
    super.key,
  });

  final String doctorId;
  final TokenProvider tokenProvider;
  final ClinicApiClient? api;

  @override
  State<DoctorDetailPage> createState() => _DoctorDetailPageState();
}

class _DoctorDetailPageState extends State<DoctorDetailPage> {
  int _selectedDateIndex = 0;
  String? _selectedTime;
  List<Slot> _slots = [];
  bool _loadingSlots = false;
  bool _booking = false;
  String? _slotError;
  DoctorSummary? _doctor;
  ApiException? _doctorError;

  late final List<DateItem> _dates;
  late final ClinicApiClient _api;
  late final SlotRepository _slotRepo;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
    _slotRepo = SlotRepository(_api);
    _dates = List.generate(4, (index) {
      final date = DateTime.now().add(Duration(days: index + 1));
      return DateItem(
        day: date.day.toString().padLeft(2, '0'),
        label: _weekday(date.weekday),
        isoDate:
            '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
      );
    });
    _loadDoctor();
    _loadSlots();
  }

  static String _weekday(int weekday) => const [
        'Thứ 2',
        'Thứ 3',
        'Thứ 4',
        'Thứ 5',
        'Thứ 6',
        'Thứ 7',
        'CN',
      ][weekday - 1];

  Future<void> _loadDoctor() async {
    setState(() => _doctorError = null);
    try {
      final doctor = await DoctorRepository(_api).fetchById(widget.doctorId);
      if (mounted) setState(() => _doctor = doctor);
    } on ApiException catch (error) {
      if (mounted) setState(() => _doctorError = error);
    }
  }

  Future<void> _loadSlots() async {
    final iso = _dates[_selectedDateIndex].isoDate;
    setState(() {
      _loadingSlots = true;
      _slotError = null;
    });
    try {
      final slots = await _slotRepo.fetchAvailable(widget.doctorId, iso);
      if (!mounted) return;
      setState(() {
        _slots = slots;
        _selectedTime = _slots.isNotEmpty ? _slots.first.label : null;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _slotError = error.message;
        _slots = [];
        _selectedTime = null;
      });
    } finally {
      if (mounted) setState(() => _loadingSlots = false);
    }
  }

  Future<void> _book() async {
    if (_selectedTime == null || _slots.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Chọn khung giờ')));
      return;
    }
    final slot = _slots.firstWhere((s) => s.label == _selectedTime,
        orElse: () => _slots.first);
    // Idempotency-Key theo contract api-contract.md:19
    final idem =
        'mobile-${DateTime.now().millisecondsSinceEpoch}-${slot.startAt.toIso8601String()}';
    setState(() => _booking = true);
    try {
      await _api.post('/api/v1/appointments',
          body: {
            'doctorId': widget.doctorId,
            'scheduledStartAt': slot.startAt.toIso8601String(),
            'scheduledEndAt': slot.endAt.toIso8601String(),
            'reason': 'Đặt qua Patient App',
          },
          idempotencyKey: idem);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Đặt lịch thành công! Kiểm tra Lịch hẹn.')));
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    } finally {
      if (mounted) setState(() => _booking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final timeLabels = _slots.map((s) => s.label).toList();

    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              if (_doctorError != null)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: AppErrorState(
                    message: _doctorError!.message,
                    requestId: _doctorError!.requestId,
                    onRetry: _loadDoctor,
                  ),
                )
              else
                Stack(
                  children: [
                    DoctorHero(
                      displayName: _doctor?.displayName ?? 'Đang tải...',
                      bio: _doctor?.bio,
                    ),
                    Positioned(
                      left: 16,
                      right: 16,
                      bottom: 0,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.08),
                              blurRadius: 16,
                              offset: const Offset(0, 8),
                            )
                          ],
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.info_outline,
                                size: 16, color: ClinicColors.primary),
                            SizedBox(width: 8),
                            Text('Thông tin và lịch khám',
                                style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: ClinicColors.ink)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: DateSelector(
                  dates: _dates,
                  selectedIndex: _selectedDateIndex,
                  onSelect: (i) {
                    setState(() => _selectedDateIndex = i);
                    _loadSlots();
                  },
                ),
              ),
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TimeSelector(
                  times: timeLabels,
                  selectedTime: _selectedTime,
                  isLoading: _loadingSlots,
                  error: _slotError,
                  onSelect: (t) => setState(() => _selectedTime = t),
                ),
              ),
              const SizedBox(height: 18),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _booking || _doctor == null ? null : _book,
                    style: FilledButton.styleFrom(
                      backgroundColor: ClinicColors.primary,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24)),
                    ),
                    child: _booking
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Đặt lịch khám',
                            style: TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Container(
                  width: 120,
                  height: 4,
                  decoration: BoxDecoration(
                      color: ClinicColors.ink,
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
