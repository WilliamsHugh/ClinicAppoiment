import 'package:flutter/material.dart';

/// Bảng màu chuẩn phê duyệt từ Anima / Figma Design Board `Health&Human`
abstract final class ClinicColors {
  // Background canvas tổng thể
  static const scaffold = Color(0xFFF5F7FA);
  // Màu xanh primary của Figma/Anima - dùng cho button, active chip, link
  static const primary = Color(0xFF2D5BFF);
  static const primarySoft = Color(0xFFE9EEFF);
  static const primaryDark = Color(0xFF1E4FE0);
  // Màu thẻ / surface
  static const card = Color(0xFFFFFFFF);
  static const surfaceSubtle = Color(0xFFEEF2F7);
  // Màu text
  static const ink = Color(0xFF0F172A);
  static const muted = Color(0xFF5A6577);
  static const mutedLight = Color(0xFF94A3B8);
  // Viền border chuẩn
  static const border = Color(0xFFD9E0EA);
  // Trạng thái y tế (Health&Human semantic status colors từ Anima tokens)
  static const success = Color(0xFF15803D);
  static const successLight = Color(0xFFE3F6E9);
  static const successDark = Color(0xFF047857);
  static const warning = Color(0xFFB45309);
  static const warningLight = Color(0xFFFEF3C7);
  static const warningDark = Color(0xFF78350F);
  static const danger = Color(0xFFB91C1C);
  static const dangerLight = Color(0xFFFEE2E2);
  static const dangerDark = Color(0xFF7F1D1D);
  static const info = Color(0xFF0284C7);
  static const infoLight = Color(0xFFF0F9FF);
  static const infoDark = Color(0xFF075985);
  // Star
  static const star = Color(0xFF0F172A);
  static const starGold = Color(0xFFF59E0B);
}

// Theme được tinh chỉnh để bám sát mobile_ui.png
ThemeData buildPatientTheme() {
  const seed = ClinicColors.primary;
  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    primary: ClinicColors.primary,
    surface: ClinicColors.scaffold,
    error: ClinicColors.danger,
    surfaceContainerHighest: ClinicColors.surfaceSubtle,
  );
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: ClinicColors.scaffold,
    fontFamily: 'Roboto',
    cardTheme: CardThemeData(
      color: ClinicColors.card,
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: ClinicColors.card,
      hintStyle: const TextStyle(color: ClinicColors.mutedLight, fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: const BorderSide(color: ClinicColors.primary, width: 1.2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: ClinicColors.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: ClinicColors.primary.withValues(alpha: 0.12),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: ClinicColors.primary,
          );
        }
        return const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: ClinicColors.muted,
        );
      }),
    ),
    textTheme: const TextTheme(
      headlineSmall: TextStyle(
        fontWeight: FontWeight.w800,
        color: ClinicColors.ink,
        height: 1.1,
        letterSpacing: -0.5,
      ),
    ),
  );
}
