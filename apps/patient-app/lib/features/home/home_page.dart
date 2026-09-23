import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../doctor_detail/doctor_detail_page.dart';
import 'widgets/category_chip.dart';
import 'widgets/doctor_card.dart';
import 'widgets/home_header.dart';
import 'widgets/search_field.dart';
import 'widgets/top_doctor_tile.dart';

/// Home - màn trái Figma, đã tách ra widgets chuyên nghiệp:
/// - widgets/home_header.dart
/// - widgets/search_field.dart
/// - widgets/category_chip.dart
/// - widgets/doctor_card.dart
/// - widgets/top_doctor_tile.dart
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String _selectedCategory = 'Gynecologist';
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              HomeHeader(
                onNotificationTap: () {
                  // điều hướng tới tab Thông báo nếu cần
                  ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Mở thông báo')));
                },
              ),
              const SizedBox(height: 18),
              const Text(
                'Manage Your\nHealth with Ease',
                style: TextStyle(
                  fontSize: 24,
                  height: 1.1,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: ClinicColors.ink,
                ),
              ),
              const SizedBox(height: 16),
              HomeSearchField(controller: _searchController),
              const SizedBox(height: 18),
              _SectionLabel(
                  title: 'Doctor Categories', onViewAll: () {}),
              const SizedBox(height: 10),
              SizedBox(
                height: 36,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    CategoryChip(
                      label: 'Gynecologist',
                      icon: Icons.favorite_border,
                      selected: _selectedCategory == 'Gynecologist',
                      onTap: () =>
                          setState(() => _selectedCategory = 'Gynecologist'),
                    ),
                    const SizedBox(width: 8),
                    CategoryChip(
                      label: 'Cardiologist',
                      icon: Icons.monitor_heart_outlined,
                      selected: _selectedCategory == 'Cardiologist',
                      onTap: () =>
                          setState(() => _selectedCategory = 'Cardiologist'),
                    ),
                    const SizedBox(width: 8),
                    CategoryChip(
                      label: 'Neurologist',
                      icon: Icons.psychology_outlined,
                      selected: _selectedCategory == 'Neurologist',
                      onTap: () =>
                          setState(() => _selectedCategory = 'Neurologist'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              _SectionLabel(title: 'Available Doctor', onViewAll: () {}),
              const SizedBox(height: 10),
              SizedBox(
                height: 176,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: 3,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return AvailableDoctorCard(
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) => const DoctorDetailPage()),
                        ),
                      );
                    }
                    return AvailableDoctorCardCompact(index: index);
                  },
                ),
              ),
              const SizedBox(height: 18),
              _SectionLabel(title: 'Top 20 Doctor', onViewAll: () {}),
              const SizedBox(height: 10),
              TopDoctorTile(
                onCall: () => ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Gọi Dr. Alex Johnson'))),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const DoctorDetailPage()),
                ),
              ),
              const SizedBox(height: 10),
              Center(
                child: Container(
                  width: 120,
                  height: 4,
                  decoration: BoxDecoration(
                    color: ClinicColors.ink,
                    borderRadius: BorderRadius.circular(12),
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

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.title, required this.onViewAll});
  final String title;
  final VoidCallback onViewAll;
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: ClinicColors.ink)),
        const Spacer(),
        GestureDetector(
          onTap: onViewAll,
          child: const Text('View All',
              style: TextStyle(
                  fontSize: 11,
                  color: ClinicColors.muted,
                  fontWeight: FontWeight.w500)),
        ),
      ],
    );
  }
}
