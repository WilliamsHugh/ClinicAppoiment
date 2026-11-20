import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../profile_validation.dart';

Future<bool?> showProfileEditSheet({
  required BuildContext context,
  required String initialFullName,
  required String initialPhone,
  required String initialDateOfBirth,
  required String initialGender,
  required String initialAddress,
  required String initialEmergencyContact,
  required String initialInsuranceNumber,
  required bool hasPatientProfile,
  required Future<void> Function({
    required String fullName,
    required String? phone,
  })
  onSaveStep1,
  Future<void> Function({
    required String? dateOfBirth,
    required String? gender,
    required String? address,
    required String? emergencyContact,
    required String? insuranceNumber,
  })?
  onSaveStep2,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (sheetCtx) => ProfileEditSheet(
      initialFullName: initialFullName,
      initialPhone: initialPhone,
      initialDateOfBirth: initialDateOfBirth,
      initialGender: initialGender,
      initialAddress: initialAddress,
      initialEmergencyContact: initialEmergencyContact,
      initialInsuranceNumber: initialInsuranceNumber,
      hasPatientProfile: hasPatientProfile,
      onSaveStep1: onSaveStep1,
      onSaveStep2: onSaveStep2,
    ),
  );
}

class ProfileEditSheet extends StatefulWidget {
  const ProfileEditSheet({
    required this.initialFullName,
    required this.initialPhone,
    required this.initialDateOfBirth,
    required this.initialGender,
    required this.initialAddress,
    required this.initialEmergencyContact,
    required this.initialInsuranceNumber,
    required this.hasPatientProfile,
    required this.onSaveStep1,
    this.onSaveStep2,
    super.key,
  });

  final String initialFullName;
  final String initialPhone;
  final String initialDateOfBirth;
  final String initialGender;
  final String initialAddress;
  final String initialEmergencyContact;
  final String initialInsuranceNumber;
  final bool hasPatientProfile;
  final Future<void> Function({
    required String fullName,
    required String? phone,
  })
  onSaveStep1;
  final Future<void> Function({
    required String? dateOfBirth,
    required String? gender,
    required String? address,
    required String? emergencyContact,
    required String? insuranceNumber,
  })?
  onSaveStep2;

  @override
  State<ProfileEditSheet> createState() => _ProfileEditSheetState();
}

class _ProfileEditSheetState extends State<ProfileEditSheet> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _dobCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _emergencyCtrl;
  late final TextEditingController _insuranceCtrl;

  String? _selectedGender;
  bool _saving = false;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.initialFullName);
    _phoneCtrl = TextEditingController(text: widget.initialPhone);
    _dobCtrl = TextEditingController(text: widget.initialDateOfBirth);
    _addressCtrl = TextEditingController(text: widget.initialAddress);
    _emergencyCtrl = TextEditingController(text: widget.initialEmergencyContact);
    _insuranceCtrl = TextEditingController(text: widget.initialInsuranceNumber);
    _selectedGender = allowedProfileGenders.contains(widget.initialGender)
        ? widget.initialGender
        : null;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _dobCtrl.dispose();
    _addressCtrl.dispose();
    _emergencyCtrl.dispose();
    _insuranceCtrl.dispose();
    super.dispose();
  }

  String? _validateAll() {
    final nameErr = validateFullName(_nameCtrl.text);
    if (nameErr != null) return nameErr;
    final phoneErr = validatePhone(_phoneCtrl.text);
    if (phoneErr != null) return phoneErr;
    if (!widget.hasPatientProfile) return null;
    final dobErr = validateDateOfBirth(_dobCtrl.text);
    if (dobErr != null) return dobErr;
    final addressErr = validateAddress(_addressCtrl.text);
    if (addressErr != null) return addressErr;
    final emergencyErr = validateEmergencyContact(_emergencyCtrl.text);
    if (emergencyErr != null) return emergencyErr;
    final insuranceErr = validateInsuranceNumber(_insuranceCtrl.text);
    if (insuranceErr != null) return insuranceErr;
    return null;
  }

  Future<bool> _confirmSaveDialog() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) {
        return AlertDialog(
          scrollable: true,
          title: const Text('Xác nhận cập nhật hồ sơ?'),
          content: const Text(
            'Bạn có chắc muốn lưu các thay đổi cho thông tin hồ sơ cá nhân?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogCtx).pop(false),
              child: const Text('Hủy'),
            ),
            FilledButton(
              key: const Key('confirm-save-profile-button'),
              onPressed: () => Navigator.of(dialogCtx).pop(true),
              child: const Text('Lưu thay đổi'),
            ),
          ],
        );
      },
    );
    return confirmed ?? false;
  }

  Future<void> _submit() async {
    final error = _validateAll();
    if (error != null) {
      setState(() => _validationError = error);
      return;
    }
    setState(() => _validationError = null);
    FocusManager.instance.primaryFocus?.unfocus();

    final confirmed = await _confirmSaveDialog();
    if (!confirmed || !mounted) return;

    final trimmedName = _nameCtrl.text.trim();
    final trimmedPhone = _phoneCtrl.text.trim();
    final trimmedDob = _dobCtrl.text.trim();
    final trimmedAddress = _addressCtrl.text.trim();
    final trimmedEmergency = _emergencyCtrl.text.trim();
    final trimmedInsurance = _insuranceCtrl.text.trim();

    setState(() => _saving = true);
    var step1Succeeded = false;
    try {
      await widget.onSaveStep1(
        fullName: trimmedName,
        phone: trimmedPhone.isEmpty ? null : trimmedPhone,
      );
      step1Succeeded = true;

      if (widget.hasPatientProfile && widget.onSaveStep2 != null) {
        await widget.onSaveStep2!(
          dateOfBirth: trimmedDob.isEmpty ? null : trimmedDob,
          gender: _selectedGender,
          address: trimmedAddress.isEmpty ? null : trimmedAddress,
          emergencyContact:
              trimmedEmergency.isEmpty ? null : trimmedEmergency,
          insuranceNumber:
              trimmedInsurance.isEmpty ? null : trimmedInsurance,
        );
      }

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (err) {
      if (!mounted) return;
      final friendlyMsg = friendlyProfileError(err);
      setState(() {
        _validationError = step1Succeeded
            ? 'Đã lưu họ tên và số điện thoại. Tuy nhiên, chưa thể cập nhật hồ sơ y tế: $friendlyMsg Bạn có thể chỉnh sửa lại và bấm lưu.'
            : friendlyMsg;
      });
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxSheetHeight = MediaQuery.sizeOf(context).height * 0.9;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return SafeArea(
      top: true,
      bottom: false,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxSheetHeight),
        child: Container(
          decoration: const BoxDecoration(
            color: ClinicColors.card,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          padding: EdgeInsets.only(bottom: bottomInset),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 20),
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
                const SizedBox(height: 14),
                const Text(
                  'Chỉnh sửa hồ sơ cá nhân',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink,
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Họ và tên',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Số điện thoại',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                ),
                if (!widget.hasPatientProfile) ...[
                  const SizedBox(height: 12),
                  Container(
                    key: const Key('no-patient-profile-notice'),
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: ClinicColors.infoLight,
                      border: Border.all(color: ClinicColors.info),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.info_outline,
                          size: 18,
                          color: ClinicColors.infoDark,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Tài khoản chưa có hồ sơ bệnh nhân nên chỉ lưu được họ và tên cùng số điện thoại.',
                            style: TextStyle(
                              fontSize: 13,
                              color: ClinicColors.infoDark,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: _dobCtrl,
                  enabled: widget.hasPatientProfile,
                  decoration: const InputDecoration(
                    labelText: 'Ngày sinh (YYYY-MM-DD)',
                    prefixIcon: Icon(Icons.calendar_today_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _selectedGender,
                  isExpanded: true,
                  hint: const Text('Chọn giới tính'),
                  disabledHint: const Text('Chưa có hồ sơ bệnh nhân'),
                  decoration: const InputDecoration(
                    labelText: 'Giới tính',
                    prefixIcon: Icon(Icons.wc_outlined),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'MALE', child: Text('Nam')),
                    DropdownMenuItem(value: 'FEMALE', child: Text('Nữ')),
                    DropdownMenuItem(value: 'OTHER', child: Text('Khác')),
                  ],
                  onChanged: widget.hasPatientProfile
                      ? (val) => setState(() => _selectedGender = val)
                      : null,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _addressCtrl,
                  enabled: widget.hasPatientProfile,
                  decoration: const InputDecoration(
                    labelText: 'Địa chỉ',
                    prefixIcon: Icon(Icons.location_on_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _emergencyCtrl,
                  enabled: widget.hasPatientProfile,
                  decoration: const InputDecoration(
                    labelText: 'Liên hệ khẩn cấp',
                    prefixIcon: Icon(Icons.contact_phone_outlined),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _insuranceCtrl,
                  enabled: widget.hasPatientProfile,
                  decoration: const InputDecoration(
                    labelText: 'Số thẻ BHYT',
                    prefixIcon: Icon(Icons.credit_card_outlined),
                  ),
                ),
                if (_validationError != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    key: const Key('profile-validation-error'),
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: ClinicColors.dangerLight,
                      border: Border.all(color: ClinicColors.danger),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _validationError!,
                      style: const TextStyle(
                        fontSize: 13,
                        color: ClinicColors.dangerDark,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    onPressed: _saving ? null : _submit,
                    child: _saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text('Lưu thay đổi'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
