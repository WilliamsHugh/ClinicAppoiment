import 'package:flutter/material.dart';

import '../../../core/session/session.dart';

class RegisterForm extends StatefulWidget {
  const RegisterForm({required this.onSubmit, super.key});
  final Future<bool> Function(String name, String email, String password)
      onSubmit;

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
          _noticeMessage =
              'Đăng ký thành công. Hãy xác nhận email trước khi đăng nhập.';
        });
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: _name,
            decoration: const InputDecoration(
              hintText: 'Họ và tên',
              prefixIcon: Icon(Icons.person_outline, size: 18),
            ),
            validator: (v) =>
                (v == null || v.trim().length < 2) ? 'Nhập họ tên' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              hintText: 'Email',
              prefixIcon: Icon(Icons.mail_outline, size: 18),
            ),
            validator: (v) =>
                (v == null || !v.contains('@')) ? 'Email không hợp lệ' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _pass,
            obscureText: _obscure,
            decoration: InputDecoration(
              hintText: 'Mật khẩu',
              prefixIcon: const Icon(Icons.lock_outline, size: 18),
              suffixIcon: IconButton(
                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility,
                    size: 18),
                onPressed: () => setState(() => _obscure = !_obscure),
              ),
            ),
            validator: (v) =>
                (v == null || v.length < 6) ? 'Tối thiểu 6 ký tự' : null,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _confirm,
            obscureText: _obscure,
            decoration: const InputDecoration(
              hintText: 'Xác nhận mật khẩu',
              prefixIcon: Icon(Icons.lock_outline, size: 18),
            ),
            validator: (v) => v != _pass.text ? 'Mật khẩu không khớp' : null,
          ),
          const SizedBox(height: 16),
          if (_errorMessage case final message?) ...[
            _AuthFeedback(
              key: const Key('register-error'),
              message: message,
              isError: true,
            ),
            const SizedBox(height: 12),
          ] else if (_noticeMessage case final message?) ...[
            _AuthFeedback(
              key: const Key('register-notice'),
              message: message,
              isError: false,
            ),
            const SizedBox(height: 12),
          ],
          FilledButton(
            onPressed: _loading ? null : _handle,
            child: _loading
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Đăng ký'),
          ),
          const SizedBox(height: 8),
          const Text(
            'Bằng việc đăng ký, bạn đồng ý với điều khoản phòng khám.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: background,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(8),
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
