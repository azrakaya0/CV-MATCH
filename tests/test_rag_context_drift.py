"""
RAG Context Drift Test Suite
Bu test, RAG sisteminin bağlam kayması problemini tespit etmek için tasarlanmıştır.
"""
import asyncio
import sys
import os
import pytest

# Backend path ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from services.rag_service import (
    chunk_text,
    chunk_text_with_metadata,
    retrieve_chunks,
    _classify_question,
    _is_contact_focused_question,
    _is_language_focused_question,
    _extract_asked_skill_token,
    _answer_from_structured,
    generate_answer,
    _q_lower,
)
from database import cv_collection

pytestmark = pytest.mark.asyncio


# Test Soruları - Karışabilecek Kategoriler
TEST_QUESTIONS = [
    # İletişim Bilgileri
    {"question": "İletişim bilgileri nedir?", "expected_category": "contact", "description": "Temel iletişim sorusu"},
    {"question": "E-posta adresi nedir?", "expected_category": "contact", "description": "Spesifik e-posta sorusu"},
    {"question": "Telefon numarası nedir?", "expected_category": "contact", "description": "Spesifik telefon sorusu"},
    {"question": "Nasıl ulaşabilirim?", "expected_category": "contact", "description": "Erişim sorusu"},
    
    # İş Deneyimi
    {"question": "Geçmiş iş deneyimleri neler?", "expected_category": "experience", "description": "Deneyim listesi sorusu"},
    {"question": "Hangi şirketlerde çalıştı?", "expected_category": "experience", "description": "Şirket sorusu"},
    {"question": "Kaç yıl deneyimi var?", "expected_category": "experience", "description": "Deneyim süresi sorusu"},
    {"question": "Nerede çalışmış?", "expected_category": "experience", "description": "Çalışma yeri sorusu"},
    
    # Beceriler
    {"question": "Hangi teknolojileri biliyor?", "expected_category": "skills", "description": "Teknoloji sorusu"},
    {"question": "Python biliyor mu?", "expected_category": "skills", "description": "Spesifik beceri sorusu"},
    {"question": "Hangi programlama dillerini kullanıyor?", "expected_category": "skills", "description": "Programlama dili sorusu"},
    
    # Eğitim
    {"question": "Eğitim bilgileri nedir?", "expected_category": "education", "description": "Eğitim sorusu"},
    {"question": "Hangi üniversitede mezun oldu?", "expected_category": "education", "description": "Üniversite sorusu"},
    
    # Diller
    {"question": "Hangi dilleri biliyor?", "expected_category": "languages", "description": "Dil sorusu"},
    {"question": "İngilizce biliyor mu?", "expected_category": "languages", "description": "Spesifik dil sorusu"},
    {"question": "Yabancı dil bilgisi nedir?", "expected_category": "languages", "description": "Yabancı dil sorusu"},
    
    # Genel/Karışık
    {"question": "Hakkında bilgi ver", "expected_category": "general", "description": "Genel özet sorusu"},
    {"question": "Özetle kim bu kişi?", "expected_category": "general", "description": "Özet sorusu"},
]


async def test_question_classification():
    """Soru sınıflandırmasını test et"""
    print("\n" + "="*80)
    print("TEST 1: SORU SINIFLANDIRMA")
    print("="*80)
    
    results = []
    for test in TEST_QUESTIONS:
        question = test["question"]
        expected = test["expected_category"]
        
        # Sınıflandırma yap
        ql = _q_lower(question)
        if _is_contact_focused_question(ql):
            actual = "contact"
        else:
            actual = _classify_question(question)
        
        # Sonucu kaydet
        is_correct = actual == expected
        results.append({
            "question": question,
            "expected": expected,
            "actual": actual,
            "correct": is_correct,
            "description": test["description"]
        })
        
        status = "✓" if is_correct else "✗"
        print(f"{status} [{expected}] {question}")
        if not is_correct:
            print(f"  → Beklenen: {expected}, Gerçekleşen: {actual}")
    
    accuracy = sum(1 for r in results if r["correct"]) / len(results) * 100
    print(f"\nSınıflandırma Doğruluğu: {accuracy:.1f}%")
    
    return results


async def test_chunking_strategy():
    """Chunking stratejisini test et"""
    print("\n" + "="*80)
    print("TEST 2: CHUNKING STRATEJİSİ (SECTION-AWARE)")
    print("="*80)
    
    # Örnek CV structured data
    sample_cv_data = {
        "name": "Ahmet Yılmaz",
        "email": "ahmet@example.com",
        "phone": "+90 555 123 4567",
        "education": [
            {
                "degree": "Bilgisayar Mühendisliği",
                "field": "",
                "institution": "İstanbul Teknik Üniversitesi",
                "year": "2018-2022"
            }
        ],
        "experience": [
            {
                "title": "Senior Developer",
                "company": "Tech Company A",
                "duration": "2022-2024",
                "description": "Python, Django, PostgreSQL kullanarak web uygulamaları geliştirdim."
            },
            {
                "title": "Junior Developer",
                "company": "Startup B",
                "duration": "2021-2022",
                "description": "React ve Node.js ile frontend geliştirme yaptım."
            }
        ],
        "skills": ["Python", "JavaScript", "React", "Django", "PostgreSQL", "MongoDB", "Docker", "AWS"],
        "languages": ["İngilizce (C1)", "Almanca (B1)"]
    }
    
    chunks = chunk_text_with_metadata(sample_cv_data)
    
    print(f"Toplam chunk sayısı: {len(chunks)}")
    print(f"Chunk size (kelime): 120")
    print(f"\nChunk örnekleri (ilk 3):")
    for i, chunk in enumerate(chunks[:3]):
        words = chunk["text"].split()
        print(f"\nChunk {i+1} ({len(words)} kelime) - Section: {chunk.get('section', 'unknown')}")
        print(chunk["text"][:150] + "..." if len(chunk["text"]) > 150 else chunk["text"])
    
    # Chunk'larda section bilgisi var mı?
    has_section_metadata = all("section" in c for c in chunks)
    sections = set(c.get("section") for c in chunks)
    print(f"\nSection metadata var: {'Evet' if has_section_metadata else 'Hayır'}")
    print(f"Bölünen section'lar: {sections}")
    
    return {
        "chunk_count": len(chunks),
        "has_section_metadata": has_section_metadata,
        "sections": sections,
    }


async def test_retrieval_accuracy():
    """Retrieval doğruluğunu test et"""
    print("\n" + "="*80)
    print("TEST 3: RETRIEVAL DOĞRULUĞU")
    print("="*80)
    
    # Örnek chunk'lar - section metadata ile
    chunks = [
        {"text": "Ahmet Yılmaz e-posta ahmet@example.com telefon +90 555 123 4567", "cv_name": "CV1", "cv_id": "1", "section": "contact"},
        {"text": "İstanbul Teknik Üniversitesi Bilgisayar Mühendisliği 2018-2022 lisans eğitimi", "cv_name": "CV1", "cv_id": "1", "section": "education"},
        {"text": "Tech Company A Senior Developer 2022-2024 Python Django PostgreSQL", "cv_name": "CV1", "cv_id": "1", "section": "experience"},
        {"text": "Startup B Junior Developer 2021-2022 React Node.js frontend", "cv_name": "CV1", "cv_id": "1", "section": "experience"},
        {"text": "Python JavaScript React Django PostgreSQL MongoDB Docker AWS becerileri", "cv_name": "CV1", "cv_id": "1", "section": "skills"},
        {"text": "İngilizce C1 seviyesinde Almanca B1 seviyesinde yabancı dil bilgisi", "cv_name": "CV1", "cv_id": "1", "section": "languages"},
    ]
    
    test_queries = [
        {"query": "İletişim bilgileri nedir?", "expected_text": "e-posta", "category": "contact"},
        {"query": "E-posta adresi", "expected_text": "e-posta", "category": "contact"},
        {"query": "Hangi üniversitede mezun oldu?", "expected_text": "Üniversitesi", "category": "education"},
        {"query": "İş deneyimi", "expected_text": "Developer", "category": "experience"},
        {"query": "Python biliyor mu?", "expected_text": "Python", "category": "skills"},
        {"query": "İngilizce seviyesi nedir?", "expected_text": "İngilizce", "category": "languages"},
    ]
    
    results = []
    for test in test_queries:
        query = test["query"]
        expected = test["expected_text"]
        category = test["category"]
        
        # Metadata filtering ile retrieval
        retrieved = retrieve_chunks(query, chunks, top_k=3, category_filter=category)
        
        # İlk chunk'ta expected text var mı?
        top_chunk = retrieved[0] if retrieved else None
        is_relevant = top_chunk and expected.lower() in top_chunk["text"].lower()
        
        results.append({
            "query": query,
            "category": category,
            "expected": expected,
            "top_chunk_text": top_chunk["text"][:100] if top_chunk else "None",
            "similarity": top_chunk["similarity"] if top_chunk else 0,
            "relevant": is_relevant,
        })
        
        status = "✓" if is_relevant else "✗"
        print(f"{status} [{category}] {query}")
        print(f"  → Top chunk similarity: {top_chunk['similarity'] if top_chunk else 0:.3f}")
        print(f"  → Top chunk: {top_chunk['text'][:80] if top_chunk else 'None'}...")
        if not is_relevant:
            print(f"  → Beklenen '{expected}' bulunamadı")
    
    accuracy = sum(1 for r in results if r["relevant"]) / len(results) * 100
    print(f"\nRetrieval Doğruluğu: {accuracy:.1f}%")
    
    return results


async def test_context_drift_scenarios():
    """Bağlam kayması senaryolarını test et"""
    print("\n" + "="*80)
    print("TEST 4: BAĞLAM KAYMASI SENARYOLARI (METADATA FILTERING İLE)")
    print("="*80)
    
    # Karışık chunk'lar (iletişim ve deneyim karışık) - section metadata ile
    mixed_chunks = [
        {"text": "Ahmet Yılmaz e-posta ahmet@example.com telefon +90 555 123 4567 iletişim", "cv_name": "CV1", "cv_id": "1", "section": "contact"},
        {"text": "Tech Company A Senior Developer 2022-2024 Python Django PostgreSQL deneyim", "cv_name": "CV1", "cv_id": "1", "section": "experience"},
        {"text": "İstanbul Teknik Üniversitesi Bilgisayar Mühendisliği eğitim", "cv_name": "CV1", "cv_id": "1", "section": "education"},
        {"text": "Startup B Junior Developer React Node.js frontend çalışma geçmişi", "cv_name": "CV1", "cv_id": "1", "section": "experience"},
        {"text": "Python JavaScript React beceriler yetenekler teknik", "cv_name": "CV1", "cv_id": "1", "section": "skills"},
    ]
    
    drift_scenarios = [
        {
            "query": "İletişim bilgileri nedir?",
            "expected_category": "contact",
            "wrong_category": "experience",
            "description": "İletişim sorusuna deneyim cevabı"
        },
        {
            "query": "E-posta adresi nedir?",
            "expected_category": "contact",
            "wrong_category": "experience",
            "description": "E-posta sorusuna deneyim cevabı"
        },
        {
            "query": "Hangi teknolojileri biliyor?",
            "expected_category": "skills",
            "wrong_category": "contact",
            "description": "Beceri sorusuna iletişim cevabı"
        },
        {
            "query": "İş deneyimi neler?",
            "expected_category": "experience",
            "wrong_category": "contact",
            "description": "Deneyim sorusuna iletişim cevabı"
        },
    ]
    
    results = []
    for scenario in drift_scenarios:
        query = scenario["query"]
        expected_cat = scenario["expected_category"]
        wrong_cat = scenario["wrong_category"]
        
        # Metadata filtering ile retrieval
        retrieved = retrieve_chunks(query, mixed_chunks, top_k=3, category_filter=expected_cat)
        
        # Yanlış kategorideki chunk'lar yüksek similarity ile geliyor mu?
        wrong_category_chunks = [c for c in retrieved if wrong_cat.lower() in c["text"].lower()]
        expected_category_chunks = [c for c in retrieved if expected_cat.lower() in c["text"].lower()]
        
        has_drift = False
        if wrong_category_chunks and expected_category_chunks:
            # Yanlış kategori chunk'ı daha yüksek similarity'ye sahip mi?
            wrong_sim = wrong_category_chunks[0]["similarity"]
            expected_sim = expected_category_chunks[0]["similarity"]
            has_drift = wrong_sim > expected_sim
        elif wrong_category_chunks and not expected_category_chunks:
            has_drift = True
        
        results.append({
            "query": query,
            "description": scenario["description"],
            "has_drift": has_drift,
            "retrieved_chunks": [c["text"][:60] for c in retrieved],
            "similarities": [c["similarity"] for c in retrieved],
        })
        
        status = "⚠ DRIFT" if has_drift else "✓ OK"
        print(f"{status} {query}")
        print(f"  → {scenario['description']}")
        print(f"  → Retrieved: {[c['text'][:40] + '...' for c in retrieved]}")
        print(f"  → Similarities: {[f'{c:.3f}' for c in [c['similarity'] for c in retrieved]]}")
    
    drift_count = sum(1 for r in results if r["has_drift"])
    print(f"\nBağlam Kayması Tespit Edilen Senaryolar: {drift_count}/{len(results)}")
    
    return results


async def main():
    """Ana test fonksiyonu"""
    print("\n" + "="*80)
    print("RAG CONTEXT DRIFT TEST SUITE")
    print("="*80)
    
    # Test 1: Soru Sınıflandırma
    classification_results = await test_question_classification()
    
    # Test 2: Chunking Stratejisi
    chunking_results = await test_chunking_strategy()
    
    # Test 3: Retrieval Doğruluğu
    retrieval_results = await test_retrieval_accuracy()
    
    # Test 4: Bağlam Kayması Senaryoları
    drift_results = await test_context_drift_scenarios()
    
    # Özet
    print("\n" + "="*80)
    print("TEST ÖZETİ")
    print("="*80)
    
    classification_accuracy = sum(1 for r in classification_results if r["correct"]) / len(classification_results) * 100
    retrieval_accuracy = sum(1 for r in retrieval_results if r["relevant"]) / len(retrieval_results) * 100
    drift_count = sum(1 for r in drift_results if r["has_drift"])
    
    print(f"\n1. Soru Sınıflandırma Doğruluğu: {classification_accuracy:.1f}%")
    print(f"2. Chunking: {chunking_results['chunk_count']} chunk, section-metadata: {chunking_results['has_section_metadata']}, sections: {chunking_results['sections']}")
    print(f"3. Retrieval Doğruluğu: {retrieval_accuracy:.1f}%")
    print(f"4. Bağlam Kayması: {drift_count}/{len(drift_results)} senaryoda tespit edildi")
    
    # Tespit edilen sorunlar
    print("\n" + "="*80)
    print("TESPİT EDİLEN SORUNLAR")
    print("="*80)
    
    issues = []
    
    if classification_accuracy < 90:
        issues.append(f"Soru sınıflandırma doğruluğu düşük (%{classification_accuracy:.1f})")
    
    if not chunking_results.get("has_section_metadata"):
        issues.append("Chunk'larda section metadata yok - retrieval'de filtering yapılamıyor")
    
    if retrieval_accuracy < 80:
        issues.append(f"Retrieval doğruluğu düşük (%{retrieval_accuracy:.1f})")
    
    if drift_count > 0:
        issues.append(f"{drift_count} bağlam kayması senaryosu tespit edildi")
    
    if issues:
        print("\nTespit edilen sorunlar:")
        for i, issue in enumerate(issues, 1):
            print(f"{i}. {issue}")
    else:
        print("\nCiddi sorun tespit edilmedi.")
    
    # Öneriler
    print("\n" + "="*80)
    print("ÖNERİLEN İYİLEŞTİRMELER")
    print("="*80)
    
    recommendations = [
        "1. Section-aware chunking: Chunk'lara section metadata (contact, experience, skills vb.) ekle",
        "2. Metadata filtering: Retrieval'de section metadata kullanarak yanlış kategorileri filtrele",
        "3. Hybrid search: Semantic search + keyword filtering kombinasyonu kullan",
        "4. Re-ranking: İlk retrieval sonrası LLM-based re-ranking yap",
        "5. System prompt iyileştirme: generate_answer() system prompt'unu güçlendir",
        "6. Question classification iyileştirme: _classify_question() fonksiyonunu güçlendir",
    ]
    
    for rec in recommendations:
        print(rec)
    
    print("\n" + "="*80)
    print("TEST TAMAMLANDI")
    print("="*80)


if __name__ == "__main__":
    asyncio.run(main())
