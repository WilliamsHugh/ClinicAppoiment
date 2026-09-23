import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../doctor_detail/doctor_detail_page.dart';
import 'data/doctor_repository.dart';
import 'widgets/doctor_card.dart';
import 'widgets/home_header.dart';
import 'widgets/search_field.dart';

class HomePage extends StatefulWidget {
  const HomePage({
    required this.tokenProvider,
    required this.onOpenNotifications,
    this.api,
    super.key,
  });

  final TokenProvider tokenProvider;
  final VoidCallback onOpenNotifications;
  final ClinicApiClient? api;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _searchController = TextEditingController();
  late final ClinicApiClient _api;
  late final DoctorRepository _repository;
  List<DoctorSummary> _doctors = [];
  bool _loading = true;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? ClinicApiClient(tokenProvider: widget.tokenProvider);
    _repository = DoctorRepository(_api);
    _searchController.addListener(_refreshFilter);
    _load();
  }

  @override
  void dispose() {
    _searchController
      ..removeListener(_refreshFilter)
      ..dispose();
    super.dispose();
  }

  void _refreshFilter() => setState(() {});

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final doctors = await _repository.fetchActive();
      if (mounted) setState(() => _doctors = doctors);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<DoctorSummary> get _filteredDoctors {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return _doctors;
    return _doctors
        .where((doctor) =>
            doctor.displayName.toLowerCase().contains(query) ||
            (doctor.bio?.toLowerCase().contains(query) ?? false))
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final doctors = _filteredDoctors;
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
            children: [
              HomeHeader(onNotificationTap: widget.onOpenNotifications),
              const SizedBox(height: 18),
              const Text(
                'Chăm sóc sức khỏe\ndễ dàng hơn',
                style: TextStyle(
                  fontSize: 24,
                  height: 1.1,
                  fontWeight: FontWeight.w800,
                  color: ClinicColors.ink,
                ),
              ),
              const SizedBox(height: 16),
              HomeSearchField(controller: _searchController),
              const SizedBox(height: 20),
              const Text(
                'Bác sĩ đang hoạt động',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: ClinicColors.ink,
                ),
              ),
              const SizedBox(height: 10),
              if (_loading)
                const AppLoadingState(label: 'Đang tải danh sách bác sĩ...')
              else if (_error != null)
                AppErrorState(
                  message: _error!.message,
                  requestId: _error!.requestId,
                  onRetry: _load,
                )
              else if (doctors.isEmpty)
                const AppEmptyState(
                  title: 'Không tìm thấy bác sĩ',
                  message: 'Thử một từ khóa khác hoặc tải lại danh sách.',
                  icon: Icons.medical_services_outlined,
                )
              else
                ...doctors.map(
                  (doctor) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AvailableDoctorCard(
                      doctor: doctor,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => DoctorDetailPage(
                            doctorId: doctor.id,
                            tokenProvider: widget.tokenProvider,
                            api: _api,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
