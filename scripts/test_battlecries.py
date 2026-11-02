"""Regression checks for battle cry classification and file layout."""
import unittest
from extract_taunts import battlecry_variants, command_directory, menu_commands


class BattleCryTests(unittest.TestCase):
    def record(self, *cues):
        return {'taunt_name': 'arbitrary_filename', 'voice_types': ['Battle cry'],
                'sources': [{'voice_cues': list(cues)}]}

    def test_cue_classification_ignores_filename(self):
        standing = self.record('A_VO_Manual.Agatha_Vanguard.Battlecry_Agatha_Vanguard')
        running = self.record('A_VO_Manual_Barb.Agatha_Knight.Battlecry_Running_Agatha_Knight_barb')
        self.assertEqual(battlecry_variants(standing), ['animated'])
        self.assertEqual(battlecry_variants(running), ['running'])
        self.assertEqual(menu_commands(standing), ['Battle cry (animated)'])
        self.assertEqual(menu_commands(running), ['Battle cry (running)'])

    def test_layout_and_shared_cues(self):
        both = self.record('A_VO_Manual.Agatha.Battlecry_Agatha',
                           'A_VO_Manual.Agatha.Battlecry_Running_Agatha')
        self.assertEqual(battlecry_variants(both), ['animated', 'running'])
        self.assertEqual(command_directory('Battle cry (animated)').as_posix(), 'battlecry/animated')
        self.assertEqual(command_directory('Battle cry (running)').as_posix(), 'battlecry/running')

    def test_unknown_battle_cues_require_review(self):
        with self.assertRaises(ValueError):
            battlecry_variants(self.record())


if __name__ == '__main__':
    unittest.main()
