import type { VoiceGroup, Voice } from '../types';

export const STREAMLABS_VOICES: VoiceGroup[] = [
    {
        lang: 'English',
        voices: [
            { label: '🇬🇧 Brian (Default)', value: 'Brian' },
            { label: '🇬🇧 Amy', value: 'Amy' },
            { label: '🇬🇧 Emma', value: 'Emma' },
            { label: '🇬🇧 Geraint', value: 'Geraint' },
            { label: '🇺🇸 Joey', value: 'Joey' },
            { label: '🇺🇸 Joanna', value: 'Joanna' },
            { label: '🇺🇸 Ivy', value: 'Ivy' },
            { label: '🇺🇸 Justin', value: 'Justin' },
            { label: '🇺🇸 Kendra', value: 'Kendra' },
            { label: '🇺🇸 Kimberly', value: 'Kimberly' },
            { label: '🇺🇸 Matthew', value: 'Matthew' },
            { label: '🇺🇸 Salli', value: 'Salli' },
            { label: '🇬🇧🇮🇳 Aditi', value: 'Aditi' },
            { label: '🇬🇧🇮🇳 Raveena', value: 'Raveena' }
        ]
    },
    {
        lang: 'Russian',
        voices: [
            { label: '🇷🇺 Maxim', value: 'Maxim' },
            { label: '🇷🇺 Tatyana', value: 'Tatyana' }
        ]
    },
    {
        lang: 'Polish',
        voices: [
            { label: '🇵🇱 Ewa', value: 'Ewa' },
            { label: '🇵🇱 Jacek', value: 'Jacek' },
            { label: '🇵🇱 Jan', value: 'Jan' },
            { label: '🇵🇱 Maja', value: 'Maja' }
        ]
    },
    {
        lang: 'Spanish',
        voices: [
            { label: '🇪🇸 Conchita', value: 'Conchita' },
            { label: '🇪🇸 Enrique', value: 'Enrique' },
            { label: '🇪🇸 Lucia', value: 'Lucia' },
            { label: '🇪🇸🇺🇸 Lupe', value: 'Lupe' },
            { label: '🇪🇸🇺🇸 Miguel', value: 'Miguel' },
            { label: '🇪🇸🇺🇸 Penelope', value: 'Penelope' },
            { label: '🇲🇽 Mia', value: 'Mia' }
        ]
    },
    {
        lang: 'French',
        voices: [
            { label: '🇫🇷 Celine', value: 'Celine' },
            { label: '🇫🇷 Lea', value: 'Lea' },
            { label: '🇫🇷 Mathieu', value: 'Mathieu' },
            { label: '🇫🇷🇨🇦 Chantal', value: 'Chantal' }
        ]
    },
    {
        lang: 'German',
        voices: [
            { label: '🇩🇪 Hans', value: 'Hans' },
            { label: '🇩🇪 Marlene', value: 'Marlene' },
            { label: '🇩🇪 Vicki', value: 'Vicki' }
        ]
    },
    {
        lang: 'Italian',
        voices: [
            { label: '🇮🇹 Bianca', value: 'Bianca' },
            { label: '🇮🇹 Carla', value: 'Carla' },
            { label: '🇮🇹 Giorgio', value: 'Giorgio' }
        ]
    },
    {
        lang: 'Portuguese',
        voices: [
            { label: '🇧🇷 Camila', value: 'Camila' },
            { label: '🇧🇷 Ricardo', value: 'Ricardo' },
            { label: '🇧🇷 Vitoria', value: 'Vitoria' },
            { label: '🇵🇹 Cristiano', value: 'Cristiano' },
            { label: '🇵🇹 Ines', value: 'Ines' }
        ]
    },
    {
        lang: 'Nordic',
        voices: [
            { label: '🇸🇪 Astrid', value: 'Astrid' },
            { label: '🇩🇰 Mads', value: 'Mads' },
            { label: '🇩🇰 Naja', value: 'Naja' },
            { label: '🇳🇴 Liv', value: 'Liv' },
            { label: '🇮🇸 Dora', value: 'Dora' },
            { label: '🇮🇸 Karl', value: 'Karl' }
        ]
    },
    {
        lang: 'Asian',
        voices: [
            { label: '🇯🇵 Mizuki', value: 'Mizuki' },
            { label: '🇯🇵 Takumi', value: 'Takumi' },
            { label: '🇰🇷 Seoyeon', value: 'Seoyeon' },
            { label: '🇨🇳 Zhiyu', value: 'Zhiyu' }
        ]
    },
    {
        lang: 'Other',
        voices: [
            { label: '🇳🇱 Lotte', value: 'Lotte' },
            { label: '🇳🇱 Ruben', value: 'Ruben' },
            { label: '🇹🇷 Filiz', value: 'Filiz' },
            { label: '🇦🇺 Nicole', value: 'Nicole' },
            { label: '🇦🇺 Russell', value: 'Russell' },
            { label: '🇷🇴 Carmen', value: 'Carmen' },
            { label: 'Zeina', value: 'Zeina' }
        ]
    }
];

export const ALL_STREAMLABS_VOICES: Voice[] = STREAMLABS_VOICES.flatMap((group: VoiceGroup) => group.voices);