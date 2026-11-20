import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'widgets/auth_header.dart';
import 'widgets/login_form.dart';
import 'widgets/register_form.dart';

/// Màn hình Đăng nhập / Đăng ký tối giản, hiện đại:
/// - Nền trắng sáng sạch sẽ, không khung bọc rườm rà
/// - Logo thương hiệu Health&Human ở giữa trên cùng
/// - Ô nhập liệu dạng pill mềm mại với bóng đổ nhẹ
/// - Nút CTA dạng pill màu chủ đạo #2D5BFF kèm bóng xanh dịu
/// - Liên kết chuyển đổi Đăng nhập <-> Đăng ký gọn gàng ngay phía dưới
class AuthPage extends StatefulWidget {
  const AuthPage({
    required this.onLogin,
    required this.onRegister,
    super.key,
  });

  final Future<void> Function(String email, String password) onLogin;
  final Future<bool> Function(String name, String email, String password)
      onRegister;

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  bool _isRegisterMode = false;
  String? _registrationNotice;

  void _handleRegisteredSuccess(String message) {
    setState(() {
      _registrationNotice = message;
      _isRegisterMode = false;
    });
  }

  void _toggleMode() {
    setState(() {
      _isRegisterMode = !_isRegisterMode;
      _registrationNotice = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final minHeight =
                (constraints.maxHeight - 40).clamp(0.0, double.infinity);
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: minHeight),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 400),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AuthHeader(compact: _isRegisterMode),
                            SizedBox(height: _isRegisterMode ? 24 : 36),
                            if (!_isRegisterMode &&
                                _registrationNotice != null) ...[
                              Container(
                                key: const Key('auth-register-success-banner'),
                                margin: const EdgeInsets.only(bottom: 18),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF0FDF4),
                                  border: Border.all(
                                    color: const Color(0xFFBBF7D0),
                                  ),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.check_circle_outline,
                                      size: 20,
                                      color: Color(0xFF166534),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        _registrationNotice!,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                          color: Color(0xFF166534),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 220),
                              child: _isRegisterMode
                                  ? RegisterForm(
                                      key: const ValueKey('register-form'),
                                      onSubmit: widget.onRegister,
                                      onRegisteredSuccess:
                                          _handleRegisteredSuccess,
                                    )
                                  : LoginForm(
                                      key: const ValueKey('login-form'),
                                      onSubmit: widget.onLogin,
                                    ),
                            ),
                            const SizedBox(height: 22),
                            Column(
                              children: [
                                Text(
                                  _isRegisterMode
                                      ? 'Đã có tài khoản?'
                                      : 'Chưa có tài khoản?',
                                  style: const TextStyle(
                                    fontSize: 13.5,
                                    color: ClinicColors.mutedLight,
                                    fontWeight: FontWeight.w400,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                TextButton(
                                  key: const Key('auth-mode-switch-button'),
                                  onPressed: _toggleMode,
                                  style: TextButton.styleFrom(
                                    foregroundColor: ClinicColors.primary,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 8,
                                    ),
                                    minimumSize: const Size(48, 40),
                                    textStyle: const TextStyle(
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.4,
                                    ),
                                  ),
                                  child: Text(
                                    _isRegisterMode ? 'Đăng nhập' : 'Đăng ký',
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 24, bottom: 4),
                          child: Text(
                            'Điều khoản sử dụng & Chính sách bảo mật',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 12,
                              color: ClinicColors.mutedLight,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
