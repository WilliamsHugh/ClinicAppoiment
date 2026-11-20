import 'package:flutter/material.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_theme.dart';
import 'auth_pill_field.dart';
import 'login_form.dart';

const String kRegisterConfirmationNotice =
    'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.';

class RegisterForm extends StatefulWidget {
  const RegisterForm({
    required this.onSubmit,
    this.onRegisteredSuccess,
    super.key,
  });

  final Future<bool> Function(String name, String email, String password)
      onSubmit;
  final ValueChanged<String>? onRegisteredSuccess;

  @override
  State<RegisterForm> createState() => _RegisterFormState();
}

class _RegisterFormState extends State<RegisterForm> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _errorMessage;
  String? _noticeMessage;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _pass.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _handle() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _errorMessage = null;
      _noticeMessage = null;
    });
    try {
      final signedIn = await widget.onSubmit(
        _name.text.trim(),
        _email.text.trim(),
        _pass.text,
      );
      if (!signedIn && mounted) {
        setState(() {
          _noticeMessage = kRegisterConfirmationNotice;
        });
        widget.onRegisteredSuccess?.call(kRegisterConfirmationNotice);
      }
    } catch (error) {
      if (mounted) setState(() => _errorMessage = _messageFor(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _messageFor(Object error) => error is SessionException
      ? error.message
      : 'Không thể đăng ký. Vui lòng thử lại.';

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          AuthPillField(
            controller: _name,
            hintText: 'Họ và tên',
            prefixIcon: Icons.person_outline_rounded,
            textInputAction: TextInputAction.next,
            validator: (v) =>
                (v == null || v.trim().length < 2) ? 'Nhập họ tên' : null,
          ),
          const SizedBox(height: 14),
          AuthPillField(
            controller: _email,
            hintText: 'Email',
            prefixIcon: Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            validator: validateAuthEmail,
          ),
          const SizedBox(height: 14),
          AuthPillField(
            controller: _pass,
            hintText: 'Mật khẩu',
            prefixIcon: Icons.lock_outline_rounded,
            obscureText: _obscure,
            textInputAction: TextInputAction.next,
            suffixIcon: IconButton(
              tooltip: _obscure ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
              icon: Icon(
                _obscure
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                size: 20,
                color: ClinicColors.mutedLight,
              ),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
            validator: validateAuthPassword,
          ),
          const SizedBox(height: 14),
          AuthPillField(
            controller: _confirm,
            hintText: 'Xác nhận mật khẩu',
            prefixIcon: Icons.lock_outline_rounded,
            obscureText: _obscure,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _loading ? null : _handle(),
            validator: (v) => v != _pass.text ? 'Mật khẩu không khớp' : null,
          ),
          if (_errorMessage case final message?) ...[
            const SizedBox(height: 14),
            _AuthFeedback(
              key: const Key('register-error'),
              message: message,
              isError: true,
            ),
          ] else if (_noticeMessage case final message?) ...[
            const SizedBox(height: 14),
            _AuthFeedback(
              key: const Key('register-notice'),
              message: message,
              isError: false,
            ),
          ],
          const SizedBox(height: 24),
          AuthPrimaryButton(
            label: 'Đăng ký',
            loading: _loading,
            onPressed: _handle,
          ),
        ],
      ),
    );
  }
}

class _AuthFeedback extends StatelessWidget {
  const _AuthFeedback({
    required this.message,
    required this.isError,
    super.key,
  });

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final background =
        isError ? const Color(0xFFFEF2F2) : const Color(0xFFF0FDF4);
    final border = isError ? const Color(0xFFFECACA) : const Color(0xFFBBF7D0);
    final foreground =
        isError ? const Color(0xFF991B1B) : const Color(0xFF166534);
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: background,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.check_circle_outline,
              size: 18,
              color: foreground,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: TextStyle(fontSize: 13, color: foreground),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
