from typing import List
from models import MatchScores


def generate_suggestions(
    scores: MatchScores,
    missing_skills: List[str],
    matched_skills: List[str],
) -> List[str]:
    suggestions = []

    if scores.overall >= 80:
        suggestions.append(
            "Profiliniz bu pozisyon için oldukça uygun! "
            "CV'nizin formatını ve sunumunu iyileştirerek öne çıkabilirsiniz."
        )
    elif scores.overall >= 60:
        suggestions.append(
            "Uyumunuz iyi seviyede. "
            "Eksik alanları geliştirerek daha güçlü bir aday olabilirsiniz."
        )
    else:
        suggestions.append(
            "Bu pozisyon için uyumunuz düşük. "
            "Aşağıdaki önerilere odaklanmanızı tavsiye ederiz."
        )

    if missing_skills:
        if scores.skills < 50:
            suggestions.append(
                f"Beceri uyumunuz düşük ({scores.skills:.0f}/100). "
                f"Şu becerileri CV'nize eklemeyi değerlendirin: "
                f"{', '.join(missing_skills[:5])}"
            )
        elif scores.skills < 75:
            suggestions.append(
                f"Şu becerileri geliştirmeniz faydalı olabilir: "
                f"{', '.join(missing_skills[:3])}"
            )
        else:
            suggestions.append(
                f"Eksik beceriler: {', '.join(missing_skills[:3])}. "
                f"Bu alanlarda kendinizi geliştirmeniz profilinizi güçlendirir."
            )

    if scores.education < 60:
        suggestions.append(
            "Eğitim seviyeniz istenen düzeyin altında. "
            "İlgili sertifika veya online kurslarla bu açığı kapatabilirsiniz."
        )

    if scores.experience < 50:
        suggestions.append(
            "Deneyim süreniz yetersiz görünüyor. "
            "Staj, freelance veya kişisel proje deneyimlerinizi "
            "detaylandırarak bu bölümü güçlendirin."
        )
    elif scores.experience < 75:
        suggestions.append(
            "Deneyim bölümünüzü güçlendirmek için mevcut projelerinizi "
            "ve başarılarınızı daha detaylı anlatın."
        )

    if scores.languages < 50:
        suggestions.append(
            "Dil yetkinlikleriniz eksik. "
            "İstenen dillerde sertifika almanız başvurunuzu güçlendirir."
        )

    return suggestions
