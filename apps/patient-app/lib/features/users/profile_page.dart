import 'package:flutter/material.dart';

import '../../core/api/clinic_api_client.dart';
import '../../core/session/session.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/async_states.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({this.tokenProvider, super.key});

  final TokenProvider? tokenProvider;

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
  String _gender = 'MALE';
  String _address = '';
  String _emergencyContact = '';
  String _insuranceNumber = '';

  @override
  void initState() {
    super.initState();
    if (widget.tokenProvider != null) {
      _apiClient = ClinicApiClient(tokenProvider: widget.tokenProvider!);
      _loadProfile();
    }
  }

  Future<void> _loadProfile() async {
    if (_apiClient == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await _apiClient!.get('/api/v1/users/me');
      final data = response.data;
      if (data is Map<String, dynamic>) {
        setState(() {
          _fullName = data['fullName']?.toString() ?? '';
          _email = data['email']?.toString() ?? '';
          _phone = data['phone']?.toString() ?? '';
          _role = data['role']?.toString() ?? 'PATIENT';
          _status = data['status']?.toString() ?? 'ACTIVE';

          final patient = data['patientProfile'];
          if (patient is Map<String, dynamic>) {
            _patientProfileId = patient['id']?.toString();
            _dateOfBirth = patient['dateOfBirth']?.toString() ?? '';
            _gender = patient['gender']?.toString() ?? 'MALE';
            _address = patient['address']?.toString() ?? '';
            _emergencyContact = patient['emergencyContact']?.toString() ?? '';
            _insuranceNumber = patient['insuranceNumber']?.toString() ?? '';
          }
        });
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  void _openEditDialog() {
    final nameCtrl = TextEditingController(text: _fullName);
    final phoneCtrl = TextEditingController(text: _phone);
    final dobCtrl = TextEditingController(text: _dateOfBirth);
    final addressCtrl = TextEditingController(text: _address);
    final emergencyCtrl = TextEditingController(text: _emergencyContact);
    final insuranceCtrl = TextEditingController(text: _insuranceNumber);
    String selectedGender = _gender.isNotEmpty ? _gender : 'MALE';
    bool saving = false;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            return Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: ClinicColors.border,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Chỉnh sửa hồ sơ cá nhân',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: ClinicColors.ink,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Họ và tên',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: phoneCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Số điện thoại',
                        prefixIcon: Icon(Icons.phone_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: dobCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Ngày sinh (YYYY-MM-DD)',
                        prefixIcon: Icon(Icons.calendar_today_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      value: selectedGender,
                      decoration: const InputDecoration(
                        labelText: 'Giới tính',
                        prefixIcon: Icon(Icons.wc_outlined),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'MALE', child: Text('Nam')),
                        DropdownMenuItem(value: 'FEMALE', child: Text('Nữ')),
                        DropdownMenuItem(value: 'OTHER', child: Text('Khác')),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          setSheetState(() => selectedGender = val);
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: addressCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Địa chỉ',
                        prefixIcon: Icon(Icons.location_on_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: emergencyCtrl,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Liên hệ khẩn cấp (SĐT)',
                        prefixIcon: Icon(Icons.contact_phone_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: insuranceCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Số thẻ BHYT',
                        prefixIcon: Icon(Icons.credit_card_outlined),
                      ),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: ClinicColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        onPressed: saving
                            ? null
                            : () async {
                                setSheetState(() => saving = true);
                                try {
                                  // Update user info
                                  await _apiClient?.patch(
                                    '/api/v1/users/me',
                                    body: {
                                      'fullName': nameCtrl.text.trim(),
                                      'phone': phoneCtrl.text.trim(),
                                    },
                                  );

                                  // Update patient profile if available
                                  if (_patientProfileId != null) {
                                    await _apiClient?.patch(
                                      '/api/v1/patients/$_patientProfileId',
                                      body: {
                                        'dateOfBirth': dobCtrl.text.trim().isEmpty ? null : dobCtrl.text.trim(),
                                        'gender': selectedGender,
                                        'address': addressCtrl.text.trim().isEmpty ? null : addressCtrl.text.trim(),
                                        'emergencyContact': emergencyCtrl.text.trim().isEmpty ? null : emergencyCtrl.text.trim(),
                                        'insuranceNumber': insuranceCtrl.text.trim().isEmpty ? null : insuranceCtrl.text.trim(),
                                      },
                                    );
                                  }

                                  if (mounted) {
                                    Navigator.pop(ctx);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Cập nhật hồ sơ thành công!'),
                                        backgroundColor: Colors.green,
                                      ),
                                    );
                                    _loadProfile();
                                  }
                                } catch (err) {
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('Lỗi: $err'),
                                        backgroundColor: Colors.red,
                                      ),
                                    );
                                  }
                                } finally {
                                  setSheetState(() => saving = false);
                                }
                              },
                        child: saving
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text(
                                'Lưu thay đổi',
                                style: TextStyle(fontWeight: FontWeight.bold),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _fullName.isEmpty) {
      return const AppLoadingState(label: 'Đang tải hồ sơ cá nhân...');
    }

    if (_error != null && _fullName.isEmpty) {
      return AppErrorState(
        message: 'Không thể tải thông tin hồ sơ: $_error',
        onRetry: _loadProfile,
      );
    }

    final initials = _fullName.isNotEmpty
        ? _fullName
            .trim()
            .split(' ')
            .map((w) => w.isNotEmpty ? w[0] : '')
            .take(2)
            .join()
            .toUpperCase()
        : 'BN';

    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      appBar: AppBar(
        title: const Text(
          'Hồ sơ cá nhân',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            tooltip: 'Làm mới',
            icon: const Icon(Icons.refresh),
            onPressed: _loadProfile,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Avatar and name header
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: ClinicColors.border),
              ),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor: ClinicColors.primary.withValues(alpha: 0.1),
                    child: Text(
                      initials,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: ClinicColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _fullName.isNotEmpty ? _fullName : 'Bệnh nhân',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: ClinicColors.ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _email.isNotEmpty ? _email : 'chua_cap_nhat@email.com',
                    style: const TextStyle(
                      fontSize: 13,
                      color: ClinicColors.muted,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ClinicColors.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _role == 'PATIENT' ? 'Bệnh nhân' : _role,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: ClinicColors.primary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: _status == 'ACTIVE'
                              ? Colors.green.withValues(alpha: 0.1)
                              : Colors.red.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _status == 'ACTIVE' ? 'Hoạt động' : _status,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: _status == 'ACTIVE' ? Colors.green : Colors.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Personal Info Card
            _buildSectionCard(
              title: 'Thông tin liên hệ',
              icon: Icons.contact_mail_outlined,
              children: [
                _buildInfoTile('Họ và tên', _fullName.isNotEmpty ? _fullName : 'Chưa cập nhật'),
                _buildInfoTile('Email', _email.isNotEmpty ? _email : 'Chưa cập nhật'),
                _buildInfoTile('Số điện thoại', _phone.isNotEmpty ? _phone : 'Chưa cập nhật'),
              ],
            ),
            const SizedBox(height: 16),

            // Medical Profile Card
            _buildSectionCard(
              title: 'Hồ sơ y tế & BHYT',
              icon: Icons.medical_information_outlined,
              children: [
                _buildInfoTile('Ngày sinh', _dateOfBirth.isNotEmpty ? _dateOfBirth : 'Chưa cập nhật'),
                _buildInfoTile(
                  'Giới tính',
                  _gender == 'MALE' ? 'Nam' : _gender == 'FEMALE' ? 'Nữ' : 'Khác',
                ),
                _buildInfoTile('Địa chỉ', _address.isNotEmpty ? _address : 'Chưa cập nhật'),
                _buildInfoTile('Liên hệ khẩn cấp', _emergencyContact.isNotEmpty ? _emergencyContact : 'Chưa cập nhật'),
                _buildInfoTile('Số thẻ BHYT', _insuranceNumber.isNotEmpty ? _insuranceNumber : 'Chưa cập nhật'),
              ],
            ),
            const SizedBox(height: 24),

            // Edit button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: ClinicColors.primary),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onPressed: _openEditDialog,
                icon: const Icon(Icons.edit_outlined, color: ClinicColors.primary),
                label: const Text(
                  'Chỉnh sửa thông tin hồ sơ',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: ClinicColors.primary,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: ClinicColors.primary),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: ClinicColors.ink,
                ),
              ),
            ],
          ),
          const Divider(height: 20, thickness: 0.5, color: ClinicColors.border),
          ...children,
        ],
      ),
    );
  }

  Widget _buildInfoTile(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: ClinicColors.muted,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: ClinicColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
