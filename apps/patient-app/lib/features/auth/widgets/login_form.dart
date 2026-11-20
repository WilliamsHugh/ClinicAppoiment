import 'package:flutter/material.dart';

import '../../../core/session/session.dart';
import '../../../core/theme/app_theme.dart';
import 'auth_pill_field.dart';

final RegExp _emailFormatRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

String? validateAuthEmail(String? value) {
  final trimmed = value?.trim() ?? '';
  if (trimmed.isEmpty || !_emailFormatRegex.hasMatch(trimmed)) {
    return 'Email không hợp lệ';
  }
  return null;
}

String? validateAuthPassword(String? value) {
  if (value == null || value.length < 8) {
    return 'Mật khẩu phải có ít nhất 8 ký tự';
  }
  return null;
}

class LoginForm extends StatefulWidget {
  const LoginForm({required this.onSubmit, super.key});
  final Future<void> Function(String email, String password) onSubmit;

  @override
  State<LoginForm> createState() => _LoginFormState();
}

class _LoginFormState extends State<LoginForm> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _email.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _handle() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      await widget.onSubmit(_email.text.trim(), _pass.text);
    } catch (error) {
      if (mounted) setState(() => _errorMessage = _messageFor(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _messageFor(Object error) => error is SessionException
      ? error.message
      : 'Không thể đăng nhập. Vui lòng thử lại.';

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
            controller: _email,
            hintText: 'Email',
            prefixIcon: Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            validator: validateAuthEmail,
          ),
          const SizedBox(height: 16),
          AuthPillField(
            controller: _pass,
            hintText: 'Mật khẩu',
            prefixIcon: Icons.lock_outline_rounded,
            obscureText: _obscure,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _loading ? null : _handle(),
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
          if (_errorMessage case final message?) ...[
            const SizedBox(height: 16),
            _AuthErrorMessage(key: const Key('login-error'), message: message),
          ],
          const SizedBox(height: 28),
          AuthPrimaryButton(
            label: 'Đăng nhập',
            loading: _loading,
            onPressed: _handle,
          ),
        ],
      ),
    );
  }
}

class _AuthErrorMessage extends StatelessWidget {
  const _AuthErrorMessage({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: const Color(0xFFFEF2F2),
          border: Border.all(color: const Color(0xFFFECACA)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.error_outline, size: 18, color: Color(0xFFB91C1C)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(fontSize: 13, color: Color(0xFF991B1B)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
