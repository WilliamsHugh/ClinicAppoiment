import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

class HomeSearchField extends StatelessWidget {
  const HomeSearchField({required this.controller, super.key});
  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: TextField(
        controller: controller,
        style: const TextStyle(fontSize: 13, color: ClinicColors.ink),
        decoration: InputDecoration(
          hintText: 'Type name here....',
          hintStyle:
              const TextStyle(color: ClinicColors.mutedLight, fontSize: 13),
          prefixIcon:
              const Icon(Icons.search, size: 18, color: ClinicColors.mutedLight),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(24),
            borderSide: BorderSide.none,
          ),
          filled: true,
          fillColor: Colors.white,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
      ),
    );
  }
}
