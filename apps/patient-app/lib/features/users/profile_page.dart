import 'package:flutter/material.dart';

import '../../core/api/api_models.dart';
import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';
import '../../shared/widgets/clinic_page_header.dart';
import 'profile_validation.dart';
import 'widgets/insurance_card.dart';
import 'widgets/profile_edit_sheet.dart';
import 'widgets/profile_hero_card.dart';
import 'widgets/profile_info_section.dart';
import 'widgets/session_security_section.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({
    this.tokenProvider,
    this.apiClient,
    this.onSignOut,
    super.key,
  });

  final TokenProvider? tokenProvider;
  final ClinicApiClient? apiClient;
  final VoidCallback? onSignOut;

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  ClinicApiClient? _apiClient;
  bool _loading = false;
  String? _error;

  String _fullName = '';
  String _email = '';
  String _phone = '';
  String _role = 'PATIENT';
  String _status = 'ACTIVE';

  String? _patientProfileId;
  String _dateOfBirth = '';
  String _gender = '';
  String _address = '';
  String _emergencyContact = '';
  String _insuranceNumber = '';

  List<AuthSessionItem> _sessions = const [];
  bool _loadingSessions = false;
  String? _sessionsError;
  final Set<String> _revokingSessionIds = <String>{};
  RequestCancellation? _profileCancellation;
  RequestCancellation? _sessionsCancellation;
  int _profileEpoch = 0;
  int _sessionsEpoch = 0;

  @override
  void initState() {
    super.initState();
    if (widget.apiClient != null || widget.tokenProvider != null) {
      _apiClient =
          widget.apiClient ??
          ClinicApiClient(tokenProvider: widget.tokenProvider!);
      _loadAll();
    }
  }

  @override
  void dispose() {
    _profileCancellation?.cancel();
    _sessionsCancellation?.cancel();
    super.dispose();
  }

  Future<void> _loadAll() async {
    if (_apiClient == null) return;
    _profileCancellation?.cancel();
    _sessionsCancellation?.cancel();
    await Future.wait<void>([
      _loadProfile(),
      _loadSessions(),
    ]);
  }

  Future<void> _loadProfile() async {
    if (_apiClient == null) return;
    _profileCancellation?.cancel();
    final cancellation = RequestCancellation();
    _profileCancellation = cancellation;
    final epoch = ++_profileEpoch;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await _apiClient!.get(
        '/api/v1/users/me',
        cancellation: cancellation,
      );
      if (!mounted || epoch != _profileEpoch || cancellation.isCancelled) {
        return;
      }
      final data = response.data;
      if (data is Map<String, dynamic>) {
        setState(() {
          _applyUserMap(data);
          final patient = data['patientProfile'];
          if (patient is Map<String, dynamic>) {
            _applyPatientMap(patient);
          } else {
            _patientProfileId = null;
            _dateOfBirth = '';
            _gender = '';
            _address = '';
            _emergencyContact = '';
            _insuranceNumber = '';
          }
        });
      }
    } catch (e) {
      if (e is ApiException && e.code == 'REQUEST_CANCELLED') {
        return;
      }
      if (!mounted || epoch != _profileEpoch || cancellation.isCancelled) {
        return;
      }
      final friendlyMsg = friendlyProfileError(e);
      setState(() => _error = friendlyMsg);
      if (_fullName.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(friendlyMsg),
            backgroundColor: ClinicColors.danger,
          ),
        );
      }
    } finally {
      if (mounted && epoch == _profileEpoch) {
        setState(() => _loading = false);
      }
    }
  }

  void _applyUserMap(Map<String, dynamic> data) {
    _fullName = data['fullName']?.toString() ?? '';
    _email = data['email']?.toString() ?? '';
    _phone = data['phone']?.toString() ?? '';
    _role = data['role']?.toString() ?? 'PATIENT';
    _status = data['status']?.toString() ?? 'ACTIVE';
  }

  void _applyPatientMap(Map<String, dynamic> patient) {
    _patientProfileId = patient['id']?.toString();
    final rawDob = patient['dateOfBirth']?.toString().trim() ?? '';
    _dateOfBirth = rawDob.contains('T') ? rawDob.split('T').first : rawDob;
    _gender = patient['gender']?.toString() ?? '';
    _address = patient['address']?.toString() ?? '';
    _emergencyContact = patient['emergencyContact']?.toString() ?? '';
    _insuranceNumber = patient['insuranceNumber']?.toString() ?? '';
  }

  Future<void> _loadSessions() async {
    if (_apiClient == null) return;
    _sessionsCancellation?.cancel();
    final cancellation = RequestCancellation();
    _sessionsCancellation = cancellation;
    final epoch = ++_sessionsEpoch;

    if (mounted) {
      setState(() {
        _loadingSessions = true;
        _sessionsError = null;
      });
    }

    try {
      String? currentSessionId;
      try {
        final currentRes = await _apiClient!.get(
          '/api/v1/auth/session',
          cancellation: cancellation,
        );
        final currentData = currentRes.data;
        if (currentData is Map) {
          final id = currentData['sessionId']?.toString().trim() ?? '';
          if (id.isNotEmpty) {
            currentSessionId = id;
          }
        }
      } catch (_) {
        // Fallback nhẹ: nếu /auth/session không stub hoặc lỗi, vẫn tiếp tục hiển thị danh sách từ /auth/sessions.
      }

      if (!mounted || epoch != _sessionsEpoch || cancellation.isCancelled) {
        return;
      }

      final response = await _apiClient!.get(
        '/api/v1/auth/sessions',
        cancellation: cancellation,
      );
      if (!mounted || epoch != _sessionsEpoch || cancellation.isCancelled) {
        return;
      }

      final data = response.data;
      if (data is Map && data['items'] is List) {
        final rawItems = data['items'] as List;
        final parsed = rawItems
            .map(
              (item) => AuthSessionItem.fromJson(
                item,
                currentSessionId: currentSessionId,
              ),
            )
            .whereType<AuthSessionItem>()
            .toList(growable: false);
        setState(() {
          _sessions = parsed;
          _sessionsError = null;
        });
      } else {
        setState(() {
          _sessions = const [];
          _sessionsError = null;
        });
      }
    } catch (e) {
      if (e is ApiException && e.code == 'REQUEST_CANCELLED') {
        return;
      }
      if (!mounted || epoch != _sessionsEpoch || cancellation.isCancelled) {
        return;
      }
      setState(() {
        _sessions = const [];
        _sessionsError = friendlyProfileError(e);
      });
    } finally {
      if (mounted && epoch == _sessionsEpoch) {
        setState(() => _loadingSessions = false);
      }
    }
  }

  Future<void> _revokeSession(AuthSessionItem session) async {
    if (_apiClient == null || !mounted) return;
    if (_revokingSessionIds.contains(session.sessionId)) return;
    setState(() => _revokingSessionIds.add(session.sessionId));
    try {
      await _apiClient!.delete('/api/v1/auth/sessions/${session.sessionId}');
      if (!mounted) return;
      setState(() {
        _sessions = _sessions
            .where((item) => item.sessionId != session.sessionId)
            .toList(growable: false);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã thu hồi phiên đăng nhập.'),
          backgroundColor: ClinicColors.success,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(friendlyProfileError(e)),
          backgroundColor: ClinicColors.danger,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _revokingSessionIds.remove(session.sessionId));
      }
    }
  }

  Future<void> _openEditSheet() async {
    final saved = await showProfileEditSheet(
      context: context,
      initialFullName: _fullName,
      initialPhone: _phone,
      initialDateOfBirth: _dateOfBirth,
      initialGender: _gender,
      initialAddress: _address,
      initialEmergencyContact: _emergencyContact,
      initialInsuranceNumber: _insuranceNumber,
      hasPatientProfile: _patientProfileId != null,
      onSaveStep1: ({required fullName, required phone}) async {
        final res = await _apiClient?.patch(
          '/api/v1/users/me',
          body: {
            'fullName': fullName,
            'phone': phone,
          },
        );
        if (!mounted) return;
        setState(() {
          final data = res?.data;
          if (data is Map<String, dynamic>) {
            _fullName = data['fullName']?.toString() ?? fullName;
            _phone = data['phone']?.toString() ?? '';
          } else {
            _fullName = fullName;
            _phone = phone ?? '';
          }
        });
      },
      onSaveStep2: ({
        required dateOfBirth,
        required gender,
        required address,
        required emergencyContact,
        required insuranceNumber,
      }) async {
        final patientId = _patientProfileId;
        if (patientId == null) return;
        final res = await _apiClient?.patch(
          '/api/v1/patients/$patientId',
          body: {
            'dateOfBirth': dateOfBirth,
            'gender': gender,
            'address': address,
            'emergencyContact': emergencyContact,
            'insuranceNumber': insuranceNumber,
          },
        );
        if (!mounted) return;
        setState(() {
          final data = res?.data;
          if (data is Map<String, dynamic>) {
            _applyPatientMap(data);
          } else {
            _dateOfBirth = dateOfBirth ?? '';
            _gender = gender ?? '';
            _address = address ?? '';
            _emergencyContact = emergencyContact ?? '';
            _insuranceNumber = insuranceNumber ?? '';
          }
        });
      },
    );

    if (saved == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cập nhật hồ sơ thành công!'),
          backgroundColor: ClinicColors.success,
        ),
      );
      await _loadProfile();
    }
  }

  ClinicPageHeader _buildHeader() {
    return ClinicPageHeader(
      title: 'Hồ sơ cá nhân',
      subtitle: 'Quản lý thông tin, BHYT & bảo mật',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: 'Làm mới',
            color: Colors.white,
            icon: const Icon(Icons.refresh),
            onPressed: _loadAll,
          ),
          if (widget.onSignOut != null)
            IconButton(
              tooltip: 'Đăng xuất',
              color: Colors.white,
              icon: const Icon(Icons.logout),
              onPressed: widget.onSignOut,
            ),
        ],
      ),
    );
  }

  String _formatGenderLabel(String gender) {
    switch (gender) {
      case 'MALE':
        return 'Nam';
      case 'FEMALE':
        return 'Nữ';
      case 'OTHER':
        return 'Khác';
      default:
        return 'Chưa cập nhật';
    }
  }

  Widget _buildCenteredScrollableState(Widget child) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final minHeight = constraints.maxHeight > 32
            ? constraints.maxHeight - 32
            : 0.0;
        return SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: minHeight),
            child: child,
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final Widget bodyContent;
    if (_loading && _fullName.isEmpty) {
      bodyContent = _buildCenteredScrollableState(
        const AppLoadingState(label: 'Đang tải hồ sơ cá nhân...'),
      );
    } else if (_error != null && _fullName.isEmpty) {
      bodyContent = _buildCenteredScrollableState(
        AppErrorState(
          message: _error!,
          onRetry: _loadAll,
        ),
      );
    } else {
      bodyContent = SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            ProfileHeroCard(
              fullName: _fullName,
              email: _email,
              phone: _phone,
              role: _role,
              status: _status,
            ),
            const SizedBox(height: 16),
            InsuranceCard(
              fullName: _fullName,
              insuranceNumber:
                  _insuranceNumber.isNotEmpty ? _insuranceNumber : null,
              dateOfBirth: _dateOfBirth.isNotEmpty ? _dateOfBirth : null,
            ),
            const SizedBox(height: 16),
            ProfileInfoSection(
              title: 'Thông tin liên hệ',
              icon: Icons.contact_mail_outlined,
              items: [
                ProfileInfoItem(
                  label: 'Họ và tên',
                  value: _fullName.isNotEmpty ? _fullName : 'Chưa cập nhật',
                ),
                ProfileInfoItem(
                  label: 'Email',
                  value: _email.isNotEmpty ? _email : 'Chưa cập nhật',
                ),
                ProfileInfoItem(
                  label: 'Số điện thoại',
                  value: _phone.isNotEmpty ? _phone : 'Chưa cập nhật',
                ),
              ],
            ),
            const SizedBox(height: 16),
            ProfileInfoSection(
              title: 'Hồ sơ y tế & BHYT',
              icon: Icons.medical_information_outlined,
              items: [
                ProfileInfoItem(
                  label: 'Ngày sinh',
                  value: _dateOfBirth.isNotEmpty
                      ? _dateOfBirth
                      : 'Chưa cập nhật',
                ),
                ProfileInfoItem(
                  label: 'Giới tính',
                  value: _formatGenderLabel(_gender),
                ),
                ProfileInfoItem(
                  label: 'Địa chỉ',
                  value: _address.isNotEmpty ? _address : 'Chưa cập nhật',
                ),
                ProfileInfoItem(
                  label: 'Liên hệ khẩn cấp',
                  value: _emergencyContact.isNotEmpty
                      ? _emergencyContact
                      : 'Chưa cập nhật',
                ),
                ProfileInfoItem(
                  label: 'Số thẻ BHYT',
                  value: _insuranceNumber.isNotEmpty
                      ? maskInsurance(_insuranceNumber)
                      : 'Chưa cập nhật',
                ),
              ],
              footer: SizedBox(
                width: double.infinity,
                height: 48,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: ClinicColors.primary,
                    side: const BorderSide(color: ClinicColors.primary),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onPressed: _openEditSheet,
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Chỉnh sửa thông tin hồ sơ'),
                ),
              ),
            ),
            const SizedBox(height: 16),
            SessionSecuritySection(
              sessions: _sessions,
              loadingSessions: _loadingSessions,
              sessionsError: _sessionsError,
              revokingSessionIds: Set<String>.of(_revokingSessionIds),
              onRefreshSessions: _apiClient != null ? _loadSessions : null,
              onRevokeSession: _apiClient != null ? _revokeSession : null,
              onSignOut: widget.onSignOut,
            ),
            const SizedBox(height: 16),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: Column(
        children: [
          _buildHeader(),
          Expanded(
            child: RefreshIndicator(
              color: ClinicColors.primary,
              onRefresh: _loadAll,
              child: bodyContent,
            ),
          ),
        ],
      ),
    );
  }
}
