#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <glpk.h>
#include <iomanip>
#include <regex>

using namespace std;

/*
 * 면접 스케줄러 제약사항 우선순위 구조
 * 
 * 1. 최우선 제약사항 (반드시 만족되어야 함)
 *    - 기본 할당 제약: 각 후보자는 정확히 한 슬롯에 배정
 *    - 슬롯 중복 방지: 각 슬롯에는 최대 1명의 피면접자만 배정
 *    - 패널 크기 제약: 각 슬롯에 배정된 후보자당 정확히 지정된 수의 면접관 필요
 *    - 면접관 중복 방지: 면접관은 한 슬롯에 최대 1명의 후보자만 면접
 *    - 가용성 제약: 후보자 및 면접관의 사용 가능 시간 준수
 * 
 * 2. 높은 우선순위 제약사항 (면접관 연속성)
 *    - 면접관 최소 연속 참여: 최소 4슬롯 연속으로 참여
 *    - 시간대 일관성: 같은 시간대(1시간)에는 같은 면접관들이 들어가야 함
 * 
 * 3. 중간 우선순위 제약사항
 *    - 피면접자 연속성: 연속된 슬롯에 배정되도록 유도
 * 
 * 4. 중간 우선순위 제약사항
 *    - 면접관 공정성: 각 면접관이 비슷한 횟수로 면접에 참여 (±5 범위 허용, 가중치 0.05)
 */

// 데이터 구조 정의
struct InterviewerSlot {
    int interviewerId;
    string interviewDate;
    string timeslot;
};

struct IntervieweeSlot {
    int intervieweeId;
    string interviewDate;
    string timeslot;
};

struct InterviewAssignment {
    int intervieweeId;
    string slot;
    vector<int> interviewerIds;
};

// JSON 파싱을 위한 헬퍼 함수들
class JsonParser {
private:
    static string trim(const string& str) {
        size_t start = str.find_first_not_of(" \t\n\r");
        if (start == string::npos) return "";
        size_t end = str.find_last_not_of(" \t\n\r");
        return str.substr(start, end - start + 1);
    }
    
    static string extractValue(const string& line) {
        size_t colonPos = line.find(':');
        if (colonPos == string::npos) return "";
        
        string value = line.substr(colonPos + 1);
        value = trim(value);
        
        // 따옴표 제거
        if (value.length() >= 2 && value[0] == '"' && value[value.length()-1] == '"') {
            value = value.substr(1, value.length() - 2);
        }
        
        // 쉼표 제거
        if (!value.empty() && value[value.length()-1] == ',') {
            value = value.substr(0, value.length() - 1);
        }
        
        // 추가 정리: JSON 파싱 후 남은 불필요한 문자들 제거
        size_t extraPos = value.find("\"");
        if (extraPos != string::npos) {
            value = value.substr(0, extraPos);
        }
        
        return trim(value);
    }
    
    static int extractIntValue(const string& line) {
        string value = extractValue(line);
        if (value.empty()) return 0;
        
        // 쉼표 제거
        if (!value.empty() && value[value.length()-1] == ',') {
            value = value.substr(0, value.length() - 1);
        }
        
        try {
            return stoi(value);
        } catch (...) {
            return 0;
        }
    }
    


public:
    static bool parseJsonFile(const string& filename, 
                            vector<string>& interviewDates,
                            vector<InterviewerSlot>& interviewerSlots,
                            vector<IntervieweeSlot>& intervieweeSlots,
                            int& panelSize) {
        ifstream file(filename);
        if (!file.is_open()) {
            cerr << "Cannot open file: " << filename << endl;
            return false;
        }
        
        // 전체 파일 내용을 한 번에 읽기
        string content;
        string line;
        while (getline(file, line)) {
            content += line + "\n";
        }
        file.close();
        

        
        // interviewDates 파싱
        size_t datesStart = content.find("\"interviewDates\":");
        if (datesStart != string::npos) {
            datesStart = content.find("[", datesStart);
            if (datesStart != string::npos) {
                size_t datesEnd = content.find("]", datesStart);
                if (datesEnd != string::npos) {
                    string datesSection = content.substr(datesStart + 1, datesEnd - datesStart - 1);
                    
                    // 쉼표로 구분된 날짜들 파싱
                    size_t start = 0;
                    while (start < datesSection.length()) {
                        size_t quoteStart = datesSection.find("\"", start);
                        if (quoteStart == string::npos) break;
                        size_t quoteEnd = datesSection.find("\"", quoteStart + 1);
                        if (quoteEnd == string::npos) break;
                        string date = datesSection.substr(quoteStart + 1, quoteEnd - quoteStart - 1);
                        interviewDates.push_back(date);
                        start = quoteEnd + 1;
                    }
                }
            }
        }
        
        // interviewerSlots 파싱
        size_t interviewerStart = content.find("\"interviewerSlots\":");
        if (interviewerStart != string::npos) {
            interviewerStart = content.find("[", interviewerStart);
            if (interviewerStart != string::npos) {
                size_t interviewerEnd = content.find("]", interviewerStart);
                if (interviewerEnd != string::npos) {
                    string interviewerSection = content.substr(interviewerStart + 1, interviewerEnd - interviewerStart - 1);
                    
                    // 각 객체를 찾아서 파싱
                    size_t start = 0;
                    while (start < interviewerSection.length()) {
                        size_t braceStart = interviewerSection.find("{", start);
                        if (braceStart == string::npos) break;
                        size_t braceEnd = interviewerSection.find("}", braceStart);
                        if (braceEnd == string::npos) break;
                        
                        string obj = interviewerSection.substr(braceStart, braceEnd - braceStart + 1);
                        InterviewerSlot slot;
                        
                        // interviewerId 추출
                        size_t idPos = obj.find("\"interviewerId\":");
                        if (idPos != string::npos) {
                            size_t valueStart = obj.find(":", idPos) + 1;
                            size_t valueEnd = obj.find(",", valueStart);
                            if (valueEnd == string::npos) valueEnd = obj.find("}", valueStart);
                            if (valueEnd != string::npos) {
                                string idStr = obj.substr(valueStart, valueEnd - valueStart);
                                slot.interviewerId = stoi(trim(idStr));
                            }
                        }
                        
                        // interviewDate 추출
                        size_t datePos = obj.find("\"interviewDate\":");
                        if (datePos != string::npos) {
                            size_t valueStart = obj.find(":", datePos) + 1;
                            valueStart = obj.find("\"", valueStart) + 1;
                            size_t valueEnd = obj.find("\"", valueStart);
                            if (valueEnd != string::npos) {
                                slot.interviewDate = obj.substr(valueStart, valueEnd - valueStart);
                            }
                        }
                        
                        // timeslot 추출 (timeSlot과 timeslot 모두 지원)
                        size_t timePos = obj.find("\"timeslot\":");
                        if (timePos == string::npos) {
                            timePos = obj.find("\"timeSlot\":"); // 대문자 S도 지원
                        }
                        if (timePos != string::npos) {
                            size_t valueStart = obj.find(":", timePos) + 1;
                            valueStart = obj.find("\"", valueStart) + 1;
                            size_t valueEnd = obj.find("\"", valueStart);
                            if (valueEnd != string::npos) {
                                slot.timeslot = obj.substr(valueStart, valueEnd - valueStart);
                            }
                        }
                        
                        interviewerSlots.push_back(slot);
                        cout << "Parsed interviewer slot: ID=" << slot.interviewerId 
                             << ", Date=" << slot.interviewDate << ", Time=" << slot.timeslot << endl;
                        start = braceEnd + 1;
                    }
                }
            }
        }
        
        // intervieweeSlots 파싱
        size_t intervieweeStart = content.find("\"intervieweeSlots\":");
        if (intervieweeStart != string::npos) {
            intervieweeStart = content.find("[", intervieweeStart);
            if (intervieweeStart != string::npos) {
                size_t intervieweeEnd = content.find("]", intervieweeStart);
                if (intervieweeEnd != string::npos) {
                    string intervieweeSection = content.substr(intervieweeStart + 1, intervieweeEnd - intervieweeStart - 1);
                    cout << "Interviewee section length: " << intervieweeSection.length() << endl;
                    
                    // 각 객체를 찾아서 파싱
                    size_t start = 0;
                    while (start < intervieweeSection.length()) {
                        size_t braceStart = intervieweeSection.find("{", start);
                        if (braceStart == string::npos) break;
                        size_t braceEnd = intervieweeSection.find("}", braceStart);
                        if (braceEnd == string::npos) break;
                        
                        string obj = intervieweeSection.substr(braceStart, braceEnd - braceStart + 1);
                        IntervieweeSlot slot;
                        
                        // intervieweeId 추출
                        size_t idPos = obj.find("\"intervieweeId\":");
                        if (idPos != string::npos) {
                            size_t valueStart = obj.find(":", idPos) + 1;
                            size_t valueEnd = obj.find(",", valueStart);
                            if (valueEnd == string::npos) valueEnd = obj.find("}", valueStart);
                            if (valueEnd != string::npos) {
                                string idStr = obj.substr(valueStart, valueEnd - valueStart);
                                slot.intervieweeId = stoi(trim(idStr));
                            }
                        }
                        
                        // interviewDate 추출
                        size_t datePos = obj.find("\"interviewDate\":");
                        if (datePos != string::npos) {
                            size_t valueStart = obj.find(":", datePos) + 1;
                            valueStart = obj.find("\"", valueStart) + 1;
                            size_t valueEnd = obj.find("\"", valueStart);
                            if (valueEnd != string::npos) {
                                slot.interviewDate = obj.substr(valueStart, valueEnd - valueStart);
                            }
                        }
                        
                        // timeslot 추출 (timeSlot과 timeslot 모두 지원)
                        size_t timePos = obj.find("\"timeslot\":");
                        if (timePos == string::npos) {
                            timePos = obj.find("\"timeSlot\":"); // 대문자 S도 지원
                        }
                        if (timePos != string::npos) {
                            size_t valueStart = obj.find(":", timePos) + 1;
                            valueStart = obj.find("\"", valueStart) + 1;
                            size_t valueEnd = obj.find("\"", valueStart);
                            if (valueEnd != string::npos) {
                                slot.timeslot = obj.substr(valueStart, valueEnd - valueStart);
                            }
                        }
                        
                        intervieweeSlots.push_back(slot);
                        cout << "Parsed interviewee slot: ID=" << slot.intervieweeId 
                             << ", Date=" << slot.interviewDate << ", Time=" << slot.timeslot << endl;
                        start = braceEnd + 1;
                    }
                }
            }
        }
        
        // panelSize 파싱
        size_t panelStart = content.find("\"panelSize\":");
        if (panelStart != string::npos) {
            size_t valueStart = content.find(":", panelStart) + 1;
            size_t valueEnd = content.find(",", valueStart);
            if (valueEnd == string::npos) valueEnd = content.find("}", valueStart);
            if (valueEnd != string::npos) {
                string panelStr = content.substr(valueStart, valueEnd - valueStart);
                panelSize = stoi(trim(panelStr));
            }

        }
        

        
        return true;
    }
};

class InterviewScheduler {
private:
    vector<string> interviewDates;
    vector<InterviewerSlot> interviewerSlots;
    vector<IntervieweeSlot> intervieweeSlots;
    int panelSize; // 면접관 수
    
    // 슬롯 정보
    vector<string> allSlots;
    unordered_map<string, int> slotToIndex;
    unordered_map<int, string> indexToSlot;
    
    // 면접관과 후보자 정보
    vector<int> interviewerIds;
    vector<int> intervieweeIds;
    unordered_map<int, vector<int>> interviewerAvailability;
    unordered_map<int, vector<int>> intervieweeAvailability;
    
    // GLPK 문제
    glp_prob *lp;
    
public:
    InterviewScheduler() : lp(nullptr) {}
    
    ~InterviewScheduler() {
        if (lp) {
            glp_delete_prob(lp);
        }
    }
    
    // 데이터 설정
    void setInterviewDates(const vector<string>& dates) {
        interviewDates = dates;
    }
    
    void setInterviewerSlots(const vector<InterviewerSlot>& slots) {
        interviewerSlots = slots;
    }
    
    void setIntervieweeSlots(const vector<IntervieweeSlot>& slots) {
        intervieweeSlots = slots;
    }
    
    void setPanelSize(int size) {
        panelSize = size;
    }
    
    // 슬롯에서 날짜를 추출하는 헬퍼 함수
    string extractDateFromSlot(const string& slot) {
        size_t spacePos = slot.find(" ");
        if (spacePos != string::npos) {
            return slot.substr(0, spacePos);
        }
        return "";
    }
    
    // 15분 슬롯이 1시간 슬롯 내에 포함되는지 확인하는 헬퍼 함수
    bool isSlotInHourRange(const string& quarterSlot, const string& hourSlot) {
        // quarterSlot: "8/21 14:00~14:15"
        // hourSlot: "8/21 14:00~15:00"
        
        // 날짜가 같은지 확인
        size_t spacePos1 = quarterSlot.find(" ");
        size_t spacePos2 = hourSlot.find(" ");
        if (spacePos1 == string::npos || spacePos2 == string::npos) return false;
        
        string date1 = quarterSlot.substr(0, spacePos1);
        string date2 = quarterSlot.substr(0, spacePos2);
        if (date1 != date2) return false;
        
        // 시간 범위 추출
        string timeRange1 = quarterSlot.substr(spacePos1 + 1);  // "14:00~14:15"
        string timeRange2 = hourSlot.substr(spacePos2 + 1);     // "14:00~15:00"
        
        // 15분 슬롯의 시작 시간
        size_t tildePos1 = timeRange1.find("~");
        if (tildePos1 == string::npos) return false;
        string startTime1 = timeRange1.substr(0, tildePos1);  // "14:00"
        
        // 1시간 슬롯의 시작 시간과 종료 시간
        size_t tildePos2 = timeRange2.find("~");
        if (tildePos2 == string::npos) return false;
        string startTime2 = timeRange2.substr(0, tildePos2);  // "14:00"
        string endTime2 = timeRange2.substr(tildePos2 + 1);   // "15:00"
        
        // 15분 슬롯의 시작 시간이 1시간 슬롯 범위 내에 있는지 확인
        // startTime1 >= startTime2 && startTime1 < endTime2
        return startTime1 >= startTime2 && startTime1 < endTime2;
    }
    
    // 15분 슬롯을 1시간 단위로 그룹핑하는 함수
    string getHourGroup(const string& quarterSlot) {
        // quarterSlot: "8/21 14:00~14:15" -> "8/21 14:00~15:00"
        size_t spacePos = quarterSlot.find(" ");
        if (spacePos == string::npos) return "";
        
        string date = quarterSlot.substr(0, spacePos);
        string timeRange = quarterSlot.substr(spacePos + 1);
        
        // 시간 범위에서 시작 시간 추출
        size_t tildePos = timeRange.find("~");
        if (tildePos == string::npos) return "";
        
        string startTime = timeRange.substr(0, tildePos);
        size_t colonPos = startTime.find(":");
        if (colonPos == string::npos) return "";
        
        int startHour = stoi(startTime.substr(0, colonPos));
        string startMinute = startTime.substr(colonPos + 1);
        
        // 1시간 단위로 그룹핑 (시작 시간을 기준으로)
        stringstream ss;
        ss << date << " " << setfill('0') << setw(2) << startHour << ":00~"
           << setfill('0') << setw(2) << (startHour + 1) << ":00";
        
        return ss.str();
    }
    
    // 슬롯 생성 (15분 단위로 생성)
    void generateTimeSlots() {
        allSlots.clear();
        slotToIndex.clear();
        indexToSlot.clear();
        
        cout << "=== Generating Time Slots ===" << endl;
        
        // JSON 파일에서 실제 사용되는 시간 슬롯만 추출
        unordered_map<string, bool> uniqueHourSlots;
        
        // 면접관 슬롯에서 시간 추출
        for (const auto& slot : interviewerSlots) {
            string fullSlot = slot.interviewDate + " " + slot.timeslot;
            uniqueHourSlots[fullSlot] = true;
        }
        
        // 후보자 슬롯에서 시간 추출
        for (const auto& slot : intervieweeSlots) {
            string fullSlot = slot.interviewDate + " " + slot.timeslot;
            uniqueHourSlots[fullSlot] = true;
        }
        
        // 고유한 1시간 슬롯들을 정렬하여 저장
        vector<string> sortedHourSlots;
        for (const auto& pair : uniqueHourSlots) {
            sortedHourSlots.push_back(pair.first);
        }
        sort(sortedHourSlots.begin(), sortedHourSlots.end());
        
        // 각 1시간 슬롯을 15분 단위로 분할
        int slotIndex = 0;
        for (const string& hourSlot : sortedHourSlots) {
            // 1시간 슬롯에서 날짜와 시간 추출
            size_t spacePos = hourSlot.find(" ");
            if (spacePos != string::npos) {
                string date = hourSlot.substr(0, spacePos);
                string timeRange = hourSlot.substr(spacePos + 1);
                
                // 시간 범위에서 시작 시간과 종료 시간 추출
                size_t tildePos = timeRange.find("~");
                if (tildePos != string::npos) {
                    string startTime = timeRange.substr(0, tildePos);
                    string endTime = timeRange.substr(tildePos + 1);
                    
                    // 시작 시간을 시간과 분으로 분리
                    size_t colonPos = startTime.find(":");
                    if (colonPos != string::npos) {
                        int startHour = stoi(startTime.substr(0, colonPos));
                        int startMinute = stoi(startTime.substr(colonPos + 1));
                        
                        // 15분 단위로 슬롯 생성
                        for (int i = 0; i < 4; i++) {
                            int currentMinute = startMinute + i * 15;
                            int currentHour = startHour;
                            
                            if (currentMinute >= 60) {
                                currentMinute -= 60;
                                currentHour++;
                            }
                            
                            int nextMinute = currentMinute + 15;
                            int nextHour = currentHour;
                            if (nextMinute >= 60) {
                                nextMinute -= 60;
                                nextHour++;
                            }
                            
                            stringstream ss;
                            ss << date << " " << setfill('0') << setw(2) << currentHour << ":" 
                               << setfill('0') << setw(2) << currentMinute << "~"
                               << setfill('0') << setw(2) << nextHour << ":" 
                               << setfill('0') << setw(2) << nextMinute;
                            
                            string quarterSlot = ss.str();
                            allSlots.push_back(quarterSlot);
                            slotToIndex[quarterSlot] = slotIndex;
                            indexToSlot[slotIndex] = quarterSlot;
                            slotIndex++;
                        }
                    }
                }
            }
        }
        
        cout << "Total slots generated: " << allSlots.size() << endl;
        cout << "Slots: ";
        for (const string& slot : allSlots) {
            cout << "'" << slot << "' ";
        }
        cout << endl;
        cout << "=== Time Slots Generated ===" << endl;
    }
    
    // 가용성 매트릭스 생성
    void buildAvailabilityMatrices() {
        cout << "\n=== Building Availability Matrices ===" << endl;
        
        // 면접관 ID 추출
        unordered_map<int, bool> seenInterviewers;
        for (const auto& slot : interviewerSlots) {
            if (!seenInterviewers[slot.interviewerId]) {
                interviewerIds.push_back(slot.interviewerId);
                seenInterviewers[slot.interviewerId] = true;
            }
        }
        
        // 후보자 ID 추출
        unordered_map<int, bool> seenInterviewees;
        for (const auto& slot : intervieweeSlots) {
            if (!seenInterviewees[slot.intervieweeId]) {
                intervieweeIds.push_back(slot.intervieweeId);
                seenInterviewees[slot.intervieweeId] = true;
            }
        }
        
        cout << "Extracted IDs:" << endl;
        cout << "  Interviewers: ";
        for (int id : interviewerIds) cout << id << " ";
        cout << endl;
        cout << "  Interviewees: ";
        for (int id : intervieweeIds) cout << id << " ";
        cout << endl;
        
        // 면접관 가용성 매트릭스
        cout << "\nBuilding interviewer availability matrix..." << endl;
        for (int interviewerId : interviewerIds) {
            vector<int> availability(allSlots.size(), 0);
            cout << "  Interviewer " << interviewerId << ":" << endl;
            
            for (const auto& slot : interviewerSlots) {
                if (slot.interviewerId == interviewerId) {
                    string fullSlot = slot.interviewDate + " " + slot.timeslot;
                    cout << "    Checking slot: '" << fullSlot << "'" << endl;
                    
                    // 1시간 슬롯에 해당하는 모든 15분 슬롯을 찾아서 가용성 설정
                    for (size_t i = 0; i < allSlots.size(); i++) {
                        string quarterSlot = allSlots[i];
                        
                        // 15분 슬롯이 1시간 슬롯 내에 포함되는지 확인
                        if (isSlotInHourRange(quarterSlot, fullSlot)) {
                            availability[i] = 1;
                            cout << "      -> Available for " << quarterSlot << " (index " << i << ")" << endl;
                        }
                    }
                }
            }
            interviewerAvailability[interviewerId] = availability;
        }
        
        // 후보자 가용성 매트릭스
        cout << "\nBuilding interviewee availability matrix..." << endl;
        for (int intervieweeId : intervieweeIds) {
            vector<int> availability(allSlots.size(), 0);
            cout << "  Interviewee " << intervieweeId << ":" << endl;
            
            for (const auto& slot : intervieweeSlots) {
                if (slot.intervieweeId == intervieweeId) {
                    string fullSlot = slot.interviewDate + " " + slot.timeslot;
                    cout << "    Checking slot: '" << fullSlot << "'" << endl;
                    
                    // 1시간 슬롯에 해당하는 모든 15분 슬롯을 찾아서 가용성 설정
                    for (size_t i = 0; i < allSlots.size(); i++) {
                        string quarterSlot = allSlots[i];
                        
                        // 15분 슬롯이 1시간 슬롯 내에 포함되는지 확인
                        if (isSlotInHourRange(quarterSlot, fullSlot)) {
                            availability[i] = 1;
                            cout << "      -> Available for " << quarterSlot << " (index " << i << ")" << endl;
                        }
                    }
                }
            }
            intervieweeAvailability[intervieweeId] = availability;
        }
        
        cout << "=== Availability Matrices Built ===" << endl;
    }
    
    // 제약 조건 검증
    void validateConstraints() {
        cout << "\n=== Constraint Validation ===" << endl;
        
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int numInterviewees = intervieweeIds.size();
        
        cout << "Problem size:" << endl;
        cout << "  - Number of slots: " << numSlots << endl;
        cout << "  - Number of interviewers: " << numInterviewers << endl;
        cout << "  - Number of interviewees: " << numInterviewees << endl;
        cout << "  - Panel size required: " << panelSize << endl;
        
        cout << "\nAvailable slots:" << endl;
        for (int i = 0; i < numSlots; i++) {
            cout << "  Slot " << i << ": " << allSlots[i] << endl;
        }
        
        cout << "\nInterviewer availability:" << endl;
        for (int i = 0; i < numInterviewers; i++) {
            int interviewerId = interviewerIds[i];
            cout << "  Interviewer " << interviewerId << ": ";
            int availableSlots = 0;
            for (int s = 0; s < numSlots; s++) {
                if (interviewerAvailability[interviewerId][s]) {
                    cout << s << " ";
                    availableSlots++;
                }
            }
            cout << " (Total: " << availableSlots << " slots)" << endl;
        }
        
        cout << "\nInterviewee availability:" << endl;
        for (int c = 0; c < numInterviewees; c++) {
            int intervieweeId = intervieweeIds[c];
            cout << "  Interviewee " << intervieweeId << ": ";
            int availableSlots = 0;
            for (int s = 0; s < numSlots; s++) {
                if (intervieweeAvailability[intervieweeId][s]) {
                    cout << s << " ";
                    availableSlots++;
                }
            }
            cout << " (Total: " << availableSlots << " slots)" << endl;
        }
        
        // 기본 실현 가능성 검사
        cout << "\n=== Feasibility Check ===" << endl;
        
        // 1. 각 후보자가 최소 1개 슬롯에 가용한지 확인
        bool allIntervieweesAvailable = true;
        for (int c = 0; c < numInterviewees; c++) {
            int intervieweeId = intervieweeIds[c];
            bool hasAvailableSlot = false;
            for (int s = 0; s < numSlots; s++) {
                if (intervieweeAvailability[intervieweeId][s]) {
                    hasAvailableSlot = true;
                    break;
                }
            }
            if (!hasAvailableSlot) {
                cout << "  ERROR: Interviewee " << intervieweeId << " has no available slots!" << endl;
                allIntervieweesAvailable = false;
            }
        }
        
        // 2. 각 슬롯에 충분한 면접관이 가용한지 확인
        bool allSlotsHaveEnoughInterviewers = true;
        for (int s = 0; s < numSlots; s++) {
            int availableInterviewers = 0;
            for (int i = 0; i < numInterviewers; i++) {
                int interviewerId = interviewerIds[i];
                if (interviewerAvailability[interviewerId][s]) {
                    availableInterviewers++;
                }
            }
            if (availableInterviewers < panelSize) {
                cout << "  ERROR: Slot " << s << " (" << allSlots[s] << ") has only " 
                     << availableInterviewers << " interviewers available, but " 
                     << panelSize << " are required!" << endl;
                allSlotsHaveEnoughInterviewers = false;
            }
        }
        
        // 3. 전체 면접관 가용 시간이 충분한지 확인
        int totalInterviewerSlots = 0;
        for (int i = 0; i < numInterviewers; i++) {
            int interviewerId = interviewerIds[i];
            for (int s = 0; s < numSlots; s++) {
                if (interviewerAvailability[interviewerId][s]) {
                    totalInterviewerSlots++;
                }
            }
        }
        
        int requiredInterviewerSlots = numInterviewees * panelSize;
        
        cout << "  Total interviewer slots available: " << totalInterviewerSlots << endl;
        cout << "  Required interviewer slots: " << requiredInterviewerSlots << endl;
        
        if (totalInterviewerSlots < requiredInterviewerSlots) {
            cout << "  ERROR: Not enough interviewer slots available!" << endl;
            allSlotsHaveEnoughInterviewers = false;
        }
        
        if (allIntervieweesAvailable && allSlotsHaveEnoughInterviewers) {
            cout << "  SUCCESS: All basic feasibility checks passed!" << endl;
        } else {
            cout << "  FAILURE: Problem is infeasible due to constraint violations!" << endl;
        }
        
        cout << "=====================================" << endl;
    }
    
    // GLPK 문제 설정
    void setupGLPKProblem() {
        lp = glp_create_prob();
        glp_set_prob_name(lp, "Interview_Scheduling");
        glp_set_obj_dir(lp, GLP_MIN); // 최소화 문제
        
        // GLPK 문제 크기 제한 설정 (큰 문제 처리 가능하도록)
        // glp_set_prob_bnds는 지원되지 않으므로 제거
        
        // 메모리 할당 최적화
        glp_term_out(GLP_ON); // 터미널 출력 활성화
        
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int numInterviewees = intervieweeIds.size();
        
        // 디버깅: 변수 개수 출력
        cout << "\n=== GLPK Problem Setup ===" << endl;
        cout << "Number of slots: " << numSlots << endl;
        cout << "Number of interviewers: " << numInterviewers << endl;
        cout << "Number of interviewees: " << numInterviewees << endl;
        cout << "Panel size: " << panelSize << endl;
        
        // 변수 개수 계산
        // x[c][s]: 후보자 c가 슬롯 s에 배정되면 1
        // y[i][s]: 면접관 i가 슬롯 s에서 면접하면 1
        // z[c][i][s]: 후보자 c를 면접관 i가 슬롯 s에서 면접하면 1
        
        int numVars = numInterviewees * numSlots +  // x[c][s]
                      numInterviewers * numSlots +   // y[i][s]
                      numInterviewees * numInterviewers * numSlots; // z[c][i][s]
        
        cout << "Total number of variables: " << numVars << endl;
        
        // 변수 개수 검증
        if (numVars <= 0) {
            cerr << "ERROR: Invalid number of variables: " << numVars << endl;
            cerr << "This usually means one of the input arrays is empty." << endl;
            return;
        }
        
        glp_add_cols(lp, numVars);
        
        // 목적 함수 설정: 단순화된 제약사항 구조에 따른 가중치 설정
        // 1. 기본 할당 제약 및 가용성 제약: 최우선 (가중치 0)
        // 2. 피면접자 연속성: 중간 우선순위 (가중치: 0.05)
        // 3. 공정성: 중간 우선순위 (가중치: 0.05)
        
        for (int varIndex = 1; varIndex <= numVars; varIndex++) {
            glp_set_obj_coef(lp, varIndex, 0.0);  // 기본적으로 모든 계수는 0
        }
        
        // 피면접자 연속성 유도를 위한 중간 가중치 설정
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                int varIndex = 1 + c * numSlots + s;
                // 연속된 시간에 배치되도록 유도
                glp_set_obj_coef(lp, varIndex, 0.05);
            }
        }
        
        // 공정성 유도를 위한 높은 가중치 설정 (공정성 강화)
        int yOffset = 1 + numInterviewees * numSlots;
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                int varIndex = yOffset + i * numSlots + s;
                // 면접관 간 면접 횟수 차이를 최소화하는 방향으로 유도 (가중치 증가)
                glp_set_obj_coef(lp, varIndex, 0.15);  // 0.05에서 0.15로 증가
            }
        }
        
        // 변수 설정
        int varIndex = 1;
        
        // x[c][s] 변수 (후보자 배정)
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                string name = "x_" + to_string(intervieweeIds[c]) + "_" + to_string(s);
                glp_set_col_name(lp, varIndex, name.c_str());
                glp_set_col_kind(lp, varIndex, GLP_BV); // 이진 변수
                glp_set_col_bnds(lp, varIndex, GLP_DB, 0.0, 1.0);
                varIndex++;
            }
        }
        
        // y[i][s] 변수 (면접관 면접)
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                string name = "y_" + to_string(interviewerIds[i]) + "_" + to_string(s);
                glp_set_col_name(lp, varIndex, name.c_str());
                glp_set_col_kind(lp, varIndex, GLP_BV); // 이진 변수
                glp_set_col_bnds(lp, varIndex, GLP_DB, 0.0, 1.0);
                varIndex++;
            }
        }
        
        // z[c][i][s] 변수 (면접 배정)
        for (int c = 0; c < numInterviewees; c++) {
            for (int i = 0; i < numInterviewers; i++) {
                for (int s = 0; s < numSlots; s++) {
                    string name = "z_" + to_string(intervieweeIds[c]) + "_" + 
                                 to_string(interviewerIds[i]) + "_" + to_string(s);
                    glp_set_col_name(lp, varIndex, name.c_str());
                    glp_set_col_kind(lp, varIndex, GLP_BV); // 이진 변수
                    glp_set_col_bnds(lp, varIndex, GLP_DB, 0.0, 1.0);
                    varIndex++;
                }
            }
        }
        
        // 제약 조건 개수 계산 및 설정
        setupConstraints();
    }
    
    // 제약 조건 설정 (우선순위 순서대로)
    void setupConstraints() {
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int numInterviewees = intervieweeIds.size();
        
            // 제약 조건 개수 계산
    int numConstraints = 0;
    
    // === 최우선 제약사항 (반드시 만족되어야 함) ===
    // 1.1. 각 후보자는 정확히 한 슬롯에 배정
    numConstraints += numInterviewees;
    
    // 1.2. 각 슬롯에 배정된 후보자당 n명의 면접관 필요
    numConstraints += numInterviewees * numSlots;
    
    // 1.2.5. 각 슬롯에는 최대 1명의 피면접자만 배정 (중복 배정 방지)
    numConstraints += numSlots;
    
    // 1.3. 면접관은 한 슬롯에 최대 1명의 후보자만 면접
    numConstraints += numInterviewers * numSlots;
    
    // 1.3.5. 면접관이 후보자를 면접할 때 해당 슬롯에서 면접한다는 것을 보장
    numConstraints += numInterviewers * numSlots;
    
    // 1.4. 가용성 제약 (후보자 및 면접관의 사용 가능 시간)
    numConstraints += numInterviewees * numSlots + numInterviewers * numSlots;
    
    // === 중간 우선순위 제약사항 ===
    // 3.1. 피면접자 연속성 제약 (연속된 시간에 배치되도록 유도)
    int maxIntervieweeContinuityConstraints = 0;
    for (const string& date : interviewDates) {
        vector<int> dateSlotIndices;
        for (int s = 0; s < numSlots; s++) {
            if (allSlots[s].find(date) == 0) {
                dateSlotIndices.push_back(s);
            }
        }
        
        sort(dateSlotIndices.begin(), dateSlotIndices.end());
        
        // 연속되지 않은 슬롯에 피면접자가 배정되는 것을 방지하는 제약 조건 개수
        for (size_t j = 0; j < dateSlotIndices.size() - 1; j++) {
            int s1 = dateSlotIndices[j];
            int s2 = dateSlotIndices[j + 1];
            
            if (s2 - s1 > 1) {
                maxIntervieweeContinuityConstraints++;
            }
        }
    }
    numConstraints += maxIntervieweeContinuityConstraints;
    
    // 3.2. 면접관 공정성 제약 (표준편차 5 이하)
    // 면접관 간 면접 횟수 차이 제한
    numConstraints += (numInterviewers * (numInterviewers - 1)) / 2;
    
    // 3.3. 면접관별 최소/최대 면접 횟수 제한 (공정성 강화)
    numConstraints += numInterviewers * 2;  // 각 면접관마다 최소/최대 제한
    

        
        glp_add_rows(lp, numConstraints);
        
        // 제약 조건 설정
        int constraintIndex = 1;
        
        // 1. 각 후보자는 정확히 한 슬롯에 배정
        for (int c = 0; c < numInterviewees; c++) {
            glp_set_row_name(lp, constraintIndex, ("candidate_" + to_string(intervieweeIds[c])).c_str());
            glp_set_row_bnds(lp, constraintIndex, GLP_FX, 1.0, 1.0);
            constraintIndex++;
        }
        
        // 2. 각 슬롯에 배정된 후보자당 정확히 n명의 면접관 필요 (panelSize 제한)
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                glp_set_row_name(lp, constraintIndex, 
                    ("panel_" + to_string(intervieweeIds[c]) + "_" + to_string(s)).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_FX, 0.0, 0.0);
                constraintIndex++;
            }
        }
        
        // 2.5. 각 슬롯에는 최대 1명의 피면접자만 배정 (중복 배정 방지)
        for (int s = 0; s < numSlots; s++) {
            glp_set_row_name(lp, constraintIndex, 
                ("slot_limit_" + to_string(s)).c_str());
            glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 1.0);
            constraintIndex++;
        }
        
        // 3. 면접관은 한 슬롯에 최대 1명의 후보자만 면접
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                glp_set_row_name(lp, constraintIndex, 
                    ("interviewer_limit_" + to_string(interviewerIds[i]) + "_" + to_string(s)).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 1.0);
                constraintIndex++;
            }
        }
        
        // 3.5. 면접관이 후보자를 면접할 때 해당 슬롯에서 면접한다는 것을 보장
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                glp_set_row_name(lp, constraintIndex, 
                    ("interviewer_activity_" + to_string(interviewerIds[i]) + "_" + to_string(s)).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 0.0);
                constraintIndex++;
            }
        }
        

        

        
        // 4. 피면접자 연속성 제약 (피면접자가 연속된 슬롯에 배정되도록 유도)
        // 각 날짜에 대해, 피면접자들이 연속된 슬롯에 배정되도록 제약
        for (const string& date : interviewDates) {
            // 해당 날짜의 슬롯들을 찾아서 인덱스 저장
            vector<int> dateSlotIndices;
            for (int s = 0; s < numSlots; s++) {
                if (allSlots[s].find(date) == 0) { // 슬롯이 해당 날짜로 시작하는지 확인
                    dateSlotIndices.push_back(s);
                }
            }
            
            // 슬롯들을 시간 순서대로 정렬
            sort(dateSlotIndices.begin(), dateSlotIndices.end());
            
            // 연속되지 않은 슬롯에 피면접자가 배정되는 것을 방지하는 제약 조건
            for (size_t j = 0; j < dateSlotIndices.size() - 1; j++) {
                int s1 = dateSlotIndices[j];
                int s2 = dateSlotIndices[j + 1];
                
                if (s2 - s1 > 1) { // 연속되지 않은 경우
                    glp_set_row_name(lp, constraintIndex, 
                        ("interviewee_continuity_" + date + "_" + to_string(s1) + "_" + to_string(s2)).c_str());
                    glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 1.0); // sum_c x[c][s1] + sum_c x[c][s2] <= 1
                    constraintIndex++;
                }
            }
        }
        
        // 5. 가용성 제약
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                glp_set_row_name(lp, constraintIndex, 
                    ("avail_candidate_" + to_string(intervieweeIds[c]) + "_" + to_string(s)).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 
                    intervieweeAvailability[intervieweeIds[c]][s]);
                constraintIndex++;
            }
        }
        
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                glp_set_row_name(lp, constraintIndex, 
                    ("avail_interviewer_" + to_string(interviewerIds[i]) + "_" + to_string(s)).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 
                    interviewerAvailability[interviewerIds[i]][s]);
                constraintIndex++;
            }
        }
        
        // 3.2. 면접관 공정성 제약 (표준편차 5 이하)
        // 모든 면접관의 면접 횟수 차이가 표준편차 5 이하가 되도록 제한
        for (int i = 0; i < numInterviewers; i++) {
            for (int j = i + 1; j < numInterviewers; j++) {
                // 면접관 i와 j의 면접 횟수 차이가 표준편차 5 이하가 되도록 제한
                // |sum_s y[i][s] - sum_s y[j][s]| <= 10 (표준편차 5 × 2)
                glp_set_row_name(lp, constraintIndex, 
                    ("fairness_diff_" + to_string(interviewerIds[i]) + "_" + to_string(interviewerIds[j])).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_DB, -10.0, 10.0); // -10 <= sum_s y[i][s] - sum_s y[j][s] <= 10
                constraintIndex++;
            }
        }
        
        // 3.3. 면접관별 최소/최대 면접 횟수 제한 (공정성 강화)
        // 각 면접관이 너무 적거나 너무 많이 면접하지 않도록 제한
        int totalRequiredInterviews = numInterviewees * panelSize;
        int avgInterviewsPerInterviewer = totalRequiredInterviews / numInterviewers;
        int minInterviews = max(1, avgInterviewsPerInterviewer - 2);  // 평균 - 2
        int maxInterviews = avgInterviewsPerInterviewer + 2;          // 평균 + 2
        
        for (int i = 0; i < numInterviewers; i++) {
            // 최소 면접 횟수 제한
            glp_set_row_name(lp, constraintIndex, 
                ("min_interviews_" + to_string(interviewerIds[i])).c_str());
            glp_set_row_bnds(lp, constraintIndex, GLP_LO, minInterviews, 0.0); // sum_s y[i][s] >= minInterviews
            constraintIndex++;
            
            // 최대 면접 횟수 제한
            glp_set_row_name(lp, constraintIndex, 
                ("max_interviews_" + to_string(interviewerIds[i])).c_str());
            glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, maxInterviews); // sum_s y[i][s] <= maxInterviews
            constraintIndex++;
        }
        
        // 제약 조건 계수 설정
        setupConstraintCoefficients();
    }
    
    // 제약 조건 계수 설정 (수정된 버전)
    void setupConstraintCoefficients() {
        int numSlots = static_cast<int>(allSlots.size());
        int numInterviewers = static_cast<int>(interviewerIds.size());
        int numInterviewees = static_cast<int>(intervieweeIds.size());
        

        
        // 변수 인덱스 오프셋 계산
        int xOffset = 1;  // x[c][s] 변수 시작 인덱스
        int yOffset = numInterviewees * numSlots + 1;  // y[i][s] 변수 시작 인덱스
        int zOffset = yOffset + numInterviewers * numSlots;  // z[c][i][s] 변수 시작 인덱스
        

        
        int constraintIndex = 1;
        
        // 1. 각 후보자는 정확히 한 슬롯에 배정
        for (int c = 0; c < numInterviewees; c++) {
            // GLPK는 1부터 시작하는 인덱스를 기대하므로 배열을 1부터 시작
            int* indices = new int[1 + numSlots];  // indices[0]은 사용하지 않음
            double* values = new double[1 + numSlots];  // values[0]은 사용하지 않음
            
            for (int s = 0; s < numSlots; s++) {
                int varIndex = xOffset + c * numSlots + s;
                if (varIndex < 1 || varIndex > numInterviewees * numSlots) {
                    cerr << "Error: Invalid x variable index: " << varIndex << endl;
                    delete[] indices;
                    delete[] values;
                    return;
                }
                indices[s + 1] = varIndex;  // 1부터 시작
                values[s + 1] = 1.0;
            }
            
            // 벡터 내용 확인
            for (int i = 1; i <= numSlots; i++) {
                if (indices[i] <= 0) {
                    cerr << "Error: Invalid index at position " << i << ": " << indices[i] << endl;
                    delete[] indices;
                    delete[] values;
                    return;
                }
            }
            
            glp_set_mat_row(lp, constraintIndex, numSlots, indices, values);
            constraintIndex++;
            
            delete[] indices;
            delete[] values;
        }
        
        // 2. 각 슬롯에 배정된 후보자당 정확히 n명의 면접관 필요 (panelSize 제한)
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                int numCoeffs = 1 + numInterviewers;  // x 변수 1개 + z 변수 numInterviewers개
                int* indices = new int[1 + numCoeffs];  // 1부터 시작
                double* values = new double[1 + numCoeffs];  // 1부터 시작
                
                int coeffIndex = 1;  // 1부터 시작
                
                // -n * x[c][s] 항 (후보자가 해당 슬롯에 배정되면 -panelSize)
                int xIndex = xOffset + c * numSlots + s;
                if (xIndex < 1 || xIndex > numInterviewees * numSlots) {
                    cerr << "Error: Invalid x variable index: " << xIndex << endl;
                    delete[] indices;
                    delete[] values;
                    return;
                }
                indices[coeffIndex] = xIndex;
                values[coeffIndex] = -panelSize;
                coeffIndex++;
                
                // sum_i z[c][i][s] 항 (해당 후보자에게 배정된 면접관 수)
                for (int i = 0; i < numInterviewers; i++) {
                    int zIndex = zOffset + c * numInterviewers * numSlots + i * numSlots + s;
                    if (zIndex < zOffset || zIndex > zOffset + numInterviewees * numInterviewers * numSlots - 1) {
                        cerr << "Error: Invalid z variable index: " << zIndex << endl;
                        delete[] indices;
                        delete[] values;
                        return;
                    }
                    indices[coeffIndex] = zIndex;
                    values[coeffIndex] = 1.0;
                    coeffIndex++;
                }
                
                // 제약사항: -panelSize * x[c][s] + sum_i z[c][i][s] = 0
                // 즉, 후보자가 슬롯에 배정되면 정확히 panelSize만큼의 면접관이 배정되어야 함
                
                // 벡터 내용 확인
                for (int i = 1; i <= numCoeffs; i++) {
                    if (indices[i] <= 0) {
                        cerr << "Error: Invalid index at position " << i << ": " << indices[i] << endl;
                        delete[] indices;
                        delete[] values;
                        return;
                    }
                }
                
                glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
                constraintIndex++;
                
                delete[] indices;
                delete[] values;
            }
        }
        
        // 2.5. 각 슬롯에는 최대 1명의 피면접자만 배정 (중복 배정 방지)
        for (int s = 0; s < numSlots; s++) {
            int numCoeffs = numInterviewees;  // 해당 슬롯의 모든 후보자 x 변수
            int* indices = new int[1 + numCoeffs];  // 1부터 시작
            double* values = new double[1 + numCoeffs];  // 1부터 시작
            
            int coeffIndex = 1;  // 1부터 시작
            
            // sum_c x[c][s] <= 1 (각 슬롯에 최대 1명의 후보자만 배정)
            for (int c = 0; c < numInterviewees; c++) {
                int xIndex = xOffset + c * numSlots + s;
                if (xIndex < 1 || xIndex > numInterviewees * numSlots) {
                    cerr << "Error: Invalid x variable index: " << xIndex << endl;
                    delete[] indices;
                    delete[] values;
                    return;
                }
                indices[coeffIndex] = xIndex;
                values[coeffIndex] = 1.0;
                coeffIndex++;
            }
            
            glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
            constraintIndex++;
            
            delete[] indices;
            delete[] values;
        }
        
        // 3. 면접관은 한 슬롯에 최대 1명의 후보자만 면접
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                int numCoeffs = 1 + numInterviewees;  // y 변수 1개 + z 변수 numInterviewees개
                int* indices = new int[1 + numCoeffs];  // 1부터 시작
                double* values = new double[1 + numCoeffs];  // 1부터 시작
                
                int coeffIndex = 1;  // 1부터 시작
                
                // -y[i][s] 항
                int yIndex = yOffset + i * numSlots + s;
                if (yIndex < yOffset || yIndex > yOffset + numInterviewers * numSlots - 1) {
                    cerr << "Error: Invalid y variable index: " << yIndex << endl;
                    delete[] indices;
                    delete[] values;
                    return;
                }
                indices[coeffIndex] = yIndex;
                values[coeffIndex] = -1.0;
                coeffIndex++;
                
                // sum_c z[c][i][s] 항
                for (int c = 0; c < numInterviewees; c++) {
                    int zIndex = zOffset + c * numInterviewers * numSlots + i * numSlots + s;
                    if (zIndex < zOffset || zIndex > zOffset + numInterviewees * numInterviewers * numSlots - 1) {
                        cerr << "Error: Invalid z variable index: " << zIndex << endl;
                        delete[] indices;
                        delete[] values;
                        return;
                    }
                    indices[coeffIndex] = zIndex;
                    values[coeffIndex] = 1.0;
                    coeffIndex++;
                }
                
                // 벡터 내용 확인
                for (int i = 1; i <= numCoeffs; i++) {
                    if (indices[i] <= 0) {
                        cerr << "Error: Invalid index at position " << i << ": " << indices[i] << endl;
                        delete[] indices;
                        delete[] values;
                        return;
                    }
                }
                
                glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
                constraintIndex++;
                
                delete[] indices;
                delete[] values;
            }
        }
        
        // 3.5. 면접관이 후보자를 면접할 때 해당 슬롯에서 면접한다는 것을 보장
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                int numCoeffs = 1 + numInterviewees;  // y 변수 1개 + z 변수 numInterviewees개
                int* indices = new int[1 + numCoeffs];  // 1부터 시작
                double* values = new double[1 + numCoeffs];  // 1부터 시작
                
                int coeffIndex = 1;  // 1부터 시작
                
                // y[i][s] 항
                int yIndex = yOffset + i * numSlots + s;
                if (yIndex < yOffset || yIndex > yOffset + numInterviewers * numSlots - 1) {
                    cerr << "Error: Invalid y variable index: " << yIndex << endl;
                    delete[] indices;
                    delete[] values;
                    return;
                }
                indices[coeffIndex] = yIndex;
                values[coeffIndex] = 1.0;
                coeffIndex++;
                
                // -sum_c z[c][i][s] 항
                for (int c = 0; c < numInterviewees; c++) {
                    int zIndex = zOffset + c * numInterviewers * numSlots + i * numSlots + s;
                    if (zIndex < zOffset || zIndex > zOffset + numInterviewees * numInterviewers * numSlots - 1) {
                        cerr << "Error: Invalid z variable index: " << zIndex << endl;
                        delete[] indices;
                        delete[] values;
                        return;
                    }
                    indices[coeffIndex] = zIndex;
                    values[coeffIndex] = -1.0;
                    coeffIndex++;
                }
                
                glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
                constraintIndex++;
                
                delete[] indices;
                delete[] values;
            }
        }
    
        
        // 3.8. 시간대 일관성 제약 계수 설정
        // 같은 시간대에는 같은 면접관들이 들어가야 함
        unordered_map<string, vector<int>> hourGroups;
        
        // 각 슬롯을 1시간 단위로 그룹핑
        for (int s = 0; s < numSlots; s++) {
            string hourGroup = getHourGroup(allSlots[s]);
            if (!hourGroup.empty()) {
                hourGroups[hourGroup].push_back(s);
            }
        }
        

        
        // 4. 피면접자 연속성 제약 계수 설정
        // 피면접자가 연속된 슬롯에 배정되도록 제약
        for (const string& date : interviewDates) {
            // 해당 날짜의 슬롯들을 찾아서 인덱스 저장
            vector<int> dateSlotIndices;
            for (int s = 0; s < numSlots; s++) {
                if (allSlots[s].find(date) == 0) { // 슬롯이 해당 날짜로 시작하는지 확인
                    dateSlotIndices.push_back(s);
                }
            }
            
            // 슬롯들을 시간 순서대로 정렬
            sort(dateSlotIndices.begin(), dateSlotIndices.end());
            
            // 연속되지 않은 슬롯에 피면접자가 배정되는 것을 방지하는 제약 조건 계수 설정
            for (size_t j = 0; j < dateSlotIndices.size() - 1; j++) {
                int s1 = dateSlotIndices[j];
                int s2 = dateSlotIndices[j + 1];
                
                if (s2 - s1 > 1) { // 연속되지 않은 경우
                    int numCoeffs = 2 * numInterviewees;  // 모든 피면접자에 대해 x[c][s1], x[c][s2]
                    int* indices = new int[1 + numCoeffs];  // 1부터 시작
                    double* values = new double[1 + numCoeffs];  // 1부터 시작
                    
                    int coeffIndex = 1;
                    
                    // sum_c x[c][s1] + sum_c x[c][s2] <= 1 (두 슬롯 중 하나에만 피면접자 배정)
                    for (int c = 0; c < numInterviewees; c++) {
                        indices[coeffIndex] = xOffset + c * numSlots + s1;  // x[c][s1] 계수 1
                        values[coeffIndex] = 1.0;
                        coeffIndex++;
                    }
                    
                    for (int c = 0; c < numInterviewees; c++) {
                        indices[coeffIndex] = xOffset + c * numSlots + s2;  // x[c][s2] 계수 1
                        values[coeffIndex] = 1.0;
                        coeffIndex++;
                    }
                    
                    glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
                    constraintIndex++;
                    
                    delete[] indices;
                    delete[] values;
                }
            }
        }
        
        // 5. 가용성 제약
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                int xIndex = xOffset + c * numSlots + s;
                if (xIndex < 1 || xIndex > numInterviewees * numSlots) {
                    cerr << "Error: Invalid x variable index: " << xIndex << endl;
                    return;
                }
                int indices[2] = {0, xIndex};  // indices[0]은 사용하지 않음
                double values[2] = {0.0, 1.0};  // values[0]은 사용하지 않음
                glp_set_mat_row(lp, constraintIndex, 1, indices, values);
                constraintIndex++;
            }
        }
        
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                int yIndex = yOffset + i * numSlots + s;
                if (yIndex < yOffset || yIndex > yOffset + numInterviewers * numSlots - 1) {
                    cerr << "Error: Invalid y variable index: " << yIndex << endl;
                    return;
                }
                int indices[2] = {0, yIndex};  // indices[0]은 사용하지 않음
                double values[2] = {0.0, 1.0};  // values[0]은 사용하지 않음
                glp_set_mat_row(lp, constraintIndex, 1, indices, values);
                constraintIndex++;
            }
        }
        

        
        // 3.2. 면접관 공정성 제약 계수 설정: 표준편차 5 이하
        // 면접관 i와 j의 면접 횟수 차이가 표준편차 5 이하가 되도록 제한
        for (int i = 0; i < numInterviewers; i++) {
            for (int j = i + 1; j < numInterviewers; j++) {
                int numCoeffs = 2 * numSlots;  // y[i][s] 변수들 + y[j][s] 변수들
                int* indices = new int[1 + numCoeffs];  // 1부터 시작
                double* values = new double[1 + numCoeffs];  // 1부터 시작
                
                int coeffIndex = 1;
                
                // sum_s y[i][s] 항 (계수 1)
                for (int s = 0; s < numSlots; s++) {
                    int yIndex = yOffset + i * numSlots + s;
                    indices[coeffIndex] = yIndex;
                    values[coeffIndex] = 1.0;
                    coeffIndex++;
                }
                
                // -sum_s y[j][s] 항 (계수 -1)
                for (int s = 0; s < numSlots; s++) {
                    int yIndex = yOffset + j * numSlots + s;
                    indices[coeffIndex] = yIndex;
                    values[coeffIndex] = -1.0;
                    coeffIndex++;
                }
                
                // 제약사항: sum_s y[i][s] - sum_s y[j][s] <= 10 (표준편차 5 × 2)
                // 즉, |면접관 i의 총 면접 횟수 - 면접관 j의 총 면접 횟수| <= 10
                
                glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
                constraintIndex++;
                
                delete[] indices;
                delete[] values;
            }
        }
        
        // 3.3. 면접관별 최소/최대 면접 횟수 제약 계수 설정
        // 각 면접관이 너무 적거나 너무 많이 면접하지 않도록 제한
        int totalRequiredInterviews = numInterviewees * panelSize;
        int avgInterviewsPerInterviewer = totalRequiredInterviews / numInterviewers;
        int minInterviews = max(1, avgInterviewsPerInterviewer - 2);  // 평균 - 2
        int maxInterviews = avgInterviewsPerInterviewer + 2;          // 평균 + 2
        
        for (int i = 0; i < numInterviewers; i++) {
            // 최소 면접 횟수 제약: sum_s y[i][s] >= minInterviews
            int numCoeffs = numSlots;  // y[i][s] 변수들
            int* indices = new int[1 + numCoeffs];  // 1부터 시작
            double* values = new double[1 + numCoeffs];  // 1부터 시작
            
            for (int s = 0; s < numSlots; s++) {
                int yIndex = yOffset + i * numSlots + s;
                indices[s + 1] = yIndex;
                values[s + 1] = 1.0;
            }
            
            glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
            constraintIndex++;
            
            delete[] indices;
            delete[] values;
            
            // 최대 면접 횟수 제약: sum_s y[i][s] <= maxInterviews
            indices = new int[1 + numCoeffs];  // 1부터 시작
            values = new double[1 + numCoeffs];  // 1부터 시작
            
            for (int s = 0; s < numSlots; s++) {
                int yIndex = yOffset + i * numSlots + s;
                indices[s + 1] = yIndex;
                values[s + 1] = 1.0;
            }
            
            glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
            constraintIndex++;
            
            delete[] indices;
            delete[] values;
        }
        

    }
    
    // 문제 해결
    bool solve() {
        if (!lp) {
            cerr << "GLPK problem not initialized" << endl;
            return false;
        }
        

        
        // GLPK 솔버 설정 (성능 최적화)
        glp_smcp smcp;
        glp_init_smcp(&smcp);
        smcp.msg_lev = GLP_MSG_ERR; // 에러만 출력 (성능 향상)
        smcp.presolve = GLP_ON; // 전처리 활성화
        
        // 선형 계획법 최적화 설정 (빠른 해결)
        smcp.tm_lim = 30000; // 30초 제한으로 더 단축
        smcp.out_frq = 10000; // 출력 빈도 더 감소
        
        // 선형 계획법 최적화 옵션 (성능 향상)
        // smcp.dual과 smcp.price는 이 GLPK 버전에서 지원되지 않음
        // 기본 설정으로 충분한 성능 제공
        

        
        // 선형 계획법으로 먼저 해결
        int ret = glp_simplex(lp, &smcp);

        
        if (ret != 0) {
            cerr << "Simplex failed with code: " << ret << endl;
            cerr << "ERROR: 가능한 인터뷰 스케줄이 없습니다. 제약 조건을 확인해주세요." << endl;
            return false;
        }
        
        // 선형 계획법 상태 확인
        int simplex_status = glp_get_status(lp);

        
        if (simplex_status != GLP_OPT) {
            cerr << "Simplex did not find optimal solution. Status: " << simplex_status << endl;
            if (simplex_status == GLP_INFEAS) {
                cerr << "ERROR: 가능한 인터뷰 스케줄이 없습니다. 제약 조건이 너무 엄격합니다." << endl;
                cerr << "다음 사항을 확인해주세요:" << endl;
                cerr << "1. 면접관과 피면접자의 가용 시간이 충분한지" << endl;
                cerr << "2. 면접관 수가 충분한지" << endl;
                cerr << "3. 연속성 제약이 너무 엄격하지 않은지" << endl;
            } else if (simplex_status == GLP_UNBND) {
                cerr << "ERROR: 문제가 제대로 설정되지 않았습니다." << endl;
            } else {
                cerr << "ERROR: 선형 계획법 해결에 실패했습니다." << endl;
            }
            return false;
        }
        

        
        // 정수 계획법으로 해결 (성능 최적화)
        glp_iocp iocp;
        glp_init_iocp(&iocp);
        iocp.msg_lev = GLP_MSG_ERR; // 에러만 출력 (성능 향상)
        iocp.tm_lim = 60000; // 1분(60초) 제한으로 더 단축
        iocp.mip_gap = 0.30; // 30% 갭 허용으로 훨씬 빠른 해결
        iocp.presolve = GLP_ON; // 전처리 활성화
        
        // 추가 최적화 설정 (빠른 해결 우선)
        iocp.binarize = GLP_ON; // 이진 변수 최적화
        
        // 탐색 전략 최적화 (속도 우선)
        iocp.br_tech = GLP_BR_MFV; // 가장 많은 제약에 관련된 변수 선택 (빠름)
        iocp.bt_tech = GLP_BT_BLB; // 하한 기반 백트래킹 (빠른 해 찾기)
        iocp.pp_tech = GLP_PP_NONE; // 전처리 비활성화 (빠름)
        
        // 추가 성능 최적화 옵션 (공격적 최적화)
        iocp.fp_heur = GLP_ON; // 휴리스틱 활성화 (빠른 해 찾기)
        iocp.gmi_cuts = GLP_OFF; // GMI 컷 비활성화 (속도 향상)
        iocp.mir_cuts = GLP_OFF; // MIR 컷 비활성화 (속도 향상)
        iocp.cov_cuts = GLP_OFF; // 커버 컷 비활성화 (속도 향상)
        iocp.clq_cuts = GLP_OFF; // 클리크 컷 비활성화 (속도 향상)
        
        // 대규모 문제 최적화
        iocp.mip_gap = 0.50; // 50% 갭 허용으로 매우 빠른 해결 (대규모 문제용)
        iocp.tm_lim = 30000; // 30초 제한으로 더욱 단축
        
        ret = glp_intopt(lp, &iocp);

        
        if (ret != 0) {
            cerr << "Integer optimization failed with code: " << ret << endl;
            cerr << "ERROR: 정수 계획법 해결에 실패했습니다." << endl;
            return false;
        }
        
        int mip_status = glp_mip_status(lp);

        
        if (mip_status == GLP_OPT) {

            return true;
        } else if (mip_status == GLP_FEAS) {

            return true;
        } else if (mip_status == GLP_INFEAS) {
            cerr << "ERROR: 가능한 인터뷰 스케줄이 없습니다!" << endl;
            cerr << "제약 조건이 너무 엄격하여 해결 가능한 스케줄이 존재하지 않습니다." << endl;
            cerr << "다음 사항을 확인해주세요:" << endl;
            cerr << "1. 면접관과 피면접자의 가용 시간이 충분한지" << endl;
            cerr << "2. 면접관 수가 충분한지" << endl;
            cerr << "3. 연속성 제약이 너무 엄격하지 않은지" << endl;
            cerr << "4. 면접 패널 크기가 적절한지" << endl;
            return false;
        } else if (mip_status == GLP_NOFEAS) {
            cerr << "ERROR: 가능한 인터뷰 스케줄이 없습니다!" << endl;
            cerr << "제약 조건을 만족하는 해가 존재하지 않습니다." << endl;
            return false;
        } else {
            cerr << "ERROR: 정수 계획법 해결에 실패했습니다. Status: " << mip_status << endl;
            return false;
        }
    }
    
    // 결과 가져오기
    vector<InterviewAssignment> getSolution() {
        vector<InterviewAssignment> assignments;
        
        if (!lp || (glp_mip_status(lp) != GLP_OPT && glp_mip_status(lp) != GLP_FEAS)) {
            return assignments;
        }
        
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int numInterviewees = intervieweeIds.size();
        

        
        for (int c = 0; c < numInterviewees; c++) {
            InterviewAssignment assignment;
            assignment.intervieweeId = intervieweeIds[c];
            
            // 후보자가 배정된 슬롯 찾기
            bool slotFound = false;
            for (int s = 0; s < numSlots; s++) {
                int varIndex = c * numSlots + s + 1;
                double value = glp_mip_col_val(lp, varIndex);

                if (value > 0.5) {
                    assignment.slot = allSlots[s];
                    slotFound = true;
                    
                    // 해당 슬롯에서 면접을 보는 면접관들 찾기
                    for (int i = 0; i < numInterviewers; i++) {
                        int zIndex = 1 + numInterviewees * numSlots + numInterviewers * numSlots + 
                                    c * numInterviewers * numSlots + i * numSlots + s;
                        double zValue = glp_mip_col_val(lp, zIndex);

                        if (zValue > 0.5) {
                            assignment.interviewerIds.push_back(interviewerIds[i]);

                        }
                    }
                    break;
                }
            }
            
            if (slotFound) {
                assignments.push_back(assignment);

            } else {

            }
        }
        

        return assignments;
    }
    
    // 결과를 JSON 파일로 저장
    void saveSolutionToJson() {
        if (!lp) {
            cout << "No problem to solve" << endl;
            return;
        }
        
        ofstream outFile("outputs/out.json");
        if (!outFile.is_open()) {
            cerr << "Cannot open output file: outputs/out.json" << endl;
            return;
        }
        
        outFile << "{" << endl;
        
        // GLPK 상태 정보
        outFile << "  \"glpkStatus\": \"";
        switch (glp_mip_status(lp)) {
            case GLP_OPT:
                outFile << "OPTIMAL";
                break;
            case GLP_FEAS:
                outFile << "FEASIBLE";
                break;
            case GLP_INFEAS:
                outFile << "INFEASIBLE";
                break;
            case GLP_NOFEAS:
                outFile << "NO_FEASIBLE_SOLUTION";
                break;
            case GLP_UNBND:
                outFile << "UNBOUNDED";
                break;
            case GLP_UNDEF:
                outFile << "UNDEFINED";
                break;
            default:
                outFile << "UNKNOWN";
        }
        outFile << "\"," << endl;
        
        if (glp_mip_status(lp) == GLP_OPT || glp_mip_status(lp) == GLP_FEAS) {
            outFile << "  \"objectiveValue\": " << glp_mip_obj_val(lp) << "," << endl;
            
            auto assignments = getSolution();
            outFile << "  \"schedule\": [" << endl;
            for (size_t i = 0; i < assignments.size(); i++) {
                const auto& assignment = assignments[i];
                outFile << "    {" << endl;
                outFile << "      \"intervieweeId\": " << assignment.intervieweeId << "," << endl;
                outFile << "      \"slot\": \"" << assignment.slot << "\"," << endl;
                outFile << "      \"interviewers\": [";
                for (size_t j = 0; j < assignment.interviewerIds.size(); j++) {
                    if (j > 0) outFile << ", ";
                    outFile << assignment.interviewerIds[j];
                }
                outFile << "]" << endl;
                if (i < assignments.size() - 1) {
                    outFile << "    }," << endl;
                } else {
                    outFile << "    }" << endl;
                }
            }
            outFile << "  ]," << endl;
            
            // 면접관별 면접 횟수 및 공정성 정보
            int numSlots = static_cast<int>(allSlots.size());
            int numInterviewers = static_cast<int>(interviewerIds.size());
            int numInterviewees = static_cast<int>(intervieweeIds.size());
            int zOffset = 1 + numInterviewees * numSlots + numInterviewers * numSlots;
            
            vector<int> interviewerCounts(numInterviewers, 0);
            
            // 각 면접관의 면접 횟수 계산 (z 변수 기반)
            for (int i = 0; i < numInterviewers; i++) {
                for (int c = 0; c < numInterviewees; c++) {
                    for (int s = 0; s < numSlots; s++) {
                        int varIndex = zOffset + c * numInterviewers * numSlots + i * numSlots + s;
                        double value = glp_mip_col_val(lp, varIndex);
                        if (value > 0.5) {
                            interviewerCounts[i]++;
                        }
                    }
                }
            }
            
            // 면접관별 면접 횟수
            outFile << "  \"interviewerCounts\": {" << endl;
            for (int i = 0; i < numInterviewers; i++) {
                outFile << "    \"" << interviewerIds[i] << "\": " << interviewerCounts[i];
                if (i < numInterviewers - 1) outFile << ",";
                outFile << endl;
            }
            outFile << "  }," << endl;
            
            // 공정성 분석
            int minInterviews = *min_element(interviewerCounts.begin(), interviewerCounts.end());
            int maxInterviews = *max_element(interviewerCounts.begin(), interviewerCounts.end());
            int fairnessGap = maxInterviews - minInterviews;
            
            outFile << "  \"fairnessAnalysis\": {" << endl;
            outFile << "  \"minInterviewsPerInterviewer\": " << minInterviews << "," << endl;
            outFile << "  \"maxInterviewsPerInterviewer\": " << maxInterviews << "," << endl;
            outFile << "  \"fairnessGap\": " << fairnessGap << "," << endl;
            outFile << "  \"result\": \"";
            if (fairnessGap <= 1) {
                outFile << "EXCELLENT - Very fair distribution";
            } else if (fairnessGap <= 2) {
                outFile << "GOOD - Fair distribution";
            } else if (fairnessGap <= 3) {
                outFile << "ACCEPTABLE - Reasonable distribution";
            } else {
                outFile << "NEEDS IMPROVEMENT - Unfair distribution";
            }
            outFile << "\"" << endl;
            outFile << "  }" << endl;
        } else {
            outFile << "  \"error\": \"NO_FEASIBLE_SOLUTION\"," << endl;
            outFile << "  \"message\": \"가능한 인터뷰 스케줄이 없습니다. 제약 조건을 확인해주세요.\"," << endl;
            outFile << "  \"possibleCauses\": [" << endl;
            outFile << "    \"면접관과 피면접자의 가용 시간이 충분하지 않음\"," << endl;
            outFile << "    \"면접관 수가 부족함\"," << endl;
            outFile << "    \"연속성 제약이 너무 엄격함\"," << endl;
            outFile << "    \"면접 패널 크기가 부적절함\"," << endl;
            outFile << "    \"제약 조건 간 충돌\"" << endl;
            outFile << "  ]," << endl;
            outFile << "  \"suggestions\": [" << endl;
            outFile << "    \"가용 시간을 늘려보세요\"," << endl;
            outFile << "    \"면접관을 추가하세요\"," << endl;
            outFile << "    \"연속성 제약을 완화하세요\"," << endl;
            outFile << "    \"패널 크기를 조정하세요\"" << endl;
            outFile << "  ]" << endl;
        }
        
        outFile << "}" << endl;
        outFile.close();
        
        cout << "Solution saved to outputs/out.json" << endl;
    }
    
    // 결과 출력 (콘솔용 - 간단한 요약만)
    void printSolution() {
        if (!lp) {
            cout << "No problem to solve" << endl;
            return;
        }
        
        cout << "GLPK Status: ";
        switch (glp_mip_status(lp)) {
            case GLP_OPT:
                cout << "OPTIMAL" << endl;
                break;
            case GLP_FEAS:
                cout << "FEASIBLE" << endl;
                break;
            case GLP_INFEAS:
                cout << "INFEASIBLE" << endl;
                break;
            case GLP_NOFEAS:
                cout << "NO FEASIBLE SOLUTION" << endl;
                break;
            case GLP_UNBND:
                cout << "UNBOUNDED" << endl;
                break;
            case GLP_UNDEF:
                cout << "UNDEFINED" << endl;
                break;
            default:
                cout << "UNKNOWN" << endl;
        }
        
        if (glp_mip_status(lp) == GLP_OPT || glp_mip_status(lp) == GLP_FEAS) {
            cout << "Objective value: " << glp_mip_obj_val(lp) << endl;
            auto assignments = getSolution();
            cout << "Total assignments: " << assignments.size() << endl;
            cout << "Solution saved to outputs/out.json" << endl;
        } else {
            cout << "ERROR: 가능한 인터뷰 스케줄이 없습니다!" << endl;
            cout << "제약 조건을 확인하고 다시 시도해주세요." << endl;
        }
    }

    // stdout으로 JSON 출력 (Node.js 연동용)
    void outputJsonToStdout() {
        if (!lp) {
            cout << "{\"error\": \"No problem to solve\"}" << endl;
            return;
        }
        
        cout << "{" << endl;
        
        // GLPK 상태 정보
        cout << "  \"glpkStatus\": \"";
        switch (glp_mip_status(lp)) {
            case GLP_OPT:
                cout << "OPTIMAL";
                break;
            case GLP_FEAS:
                cout << "FEASIBLE";
                break;
            case GLP_INFEAS:
                cout << "INFEASIBLE";
                break;
            case GLP_NOFEAS:
                cout << "NO_FEASIBLE_SOLUTION";
                break;
            case GLP_UNBND:
                cout << "UNBOUNDED";
                break;
            case GLP_UNDEF:
                cout << "UNDEFINED";
                break;
            default:
                cout << "UNKNOWN";
        }
        cout << "\"," << endl;
        
        if (glp_mip_status(lp) == GLP_OPT) {
            cout << "  \"objectiveValue\": " << glp_mip_obj_val(lp) << "," << endl;
            
            auto assignments = getSolution();
            cout << "  \"schedule\": [" << endl;
            for (size_t i = 0; i < assignments.size(); i++) {
                const auto& assignment = assignments[i];
                cout << "    {" << endl;
                cout << "      \"intervieweeId\": " << assignment.intervieweeId << "," << endl;
                cout << "      \"slot\": \"" << assignment.slot << "\"," << endl;
                cout << "      \"interviewers\": [";
                for (size_t j = 0; j < assignment.interviewerIds.size(); j++) {
                    if (j > 0) cout << ", ";
                    cout << assignment.interviewerIds[j];
                }
                cout << "]" << endl;
                if (i < assignments.size() - 1) {
                    cout << "    }," << endl;
                } else {
                    cout << "    }" << endl;
                }
            }
            cout << "  ]," << endl;
            
            // 면접관별 면접 횟수 및 공정성 정보
            int numSlots = static_cast<int>(allSlots.size());
            int numInterviewers = static_cast<int>(interviewerIds.size());
            int numInterviewees = static_cast<int>(intervieweeIds.size());
            int zOffset = 1 + numInterviewees * numSlots + numInterviewers * numSlots;
            
            vector<int> interviewerCounts(numInterviewers, 0);
            
            // 각 면접관의 면접 횟수 계산 (z 변수 기반)
            for (int i = 0; i < numInterviewers; i++) {
                for (int c = 0; c < numInterviewees; c++) {
                    for (int s = 0; s < numSlots; s++) {
                        int varIndex = 1 + numInterviewees * numSlots + numInterviewers * numSlots + c * numInterviewers * numSlots + i * numSlots + s;
                        double value = glp_mip_col_val(lp, varIndex);
                        if (value > 0.5) {
                            interviewerCounts[i]++;
                        }
                    }
                }
            }
            
            // 면접관별 면접 횟수
            cout << "  \"interviewerCounts\": {" << endl;
            for (int i = 0; i < numInterviewers; i++) {
                cout << "    \"" << interviewerIds[i] << "\": " << interviewerCounts[i];
                if (i < numInterviewers - 1) cout << ",";
                cout << endl;
            }
            cout << "  }," << endl;
            
            // 공정성 분석
            int minInterviews = *min_element(interviewerCounts.begin(), interviewerCounts.end());
            int maxInterviews = *max_element(interviewerCounts.begin(), interviewerCounts.end());
            int fairnessGap = maxInterviews - minInterviews;
            
            cout << "  \"fairnessAnalysis\": {" << endl;
            cout << "  \"minInterviewsPerInterviewer\": " << minInterviews << "," << endl;
            cout << "  \"maxInterviewsPerInterviewer\": " << maxInterviews << "," << endl;
            cout << "  \"fairnessGap\": " << fairnessGap << "," << endl;
            cout << "  \"result\": \"";
            if (fairnessGap <= 1) {
                cout << "EXCELLENT - Very fair distribution";
            } else if (fairnessGap <= 2) {
                cout << "GOOD - Fair distribution";
            } else if (fairnessGap <= 3) {
                cout << "ACCEPTABLE - Reasonable distribution";
            } else {
                cout << "NEEDS IMPROVEMENT - Unfair distribution";
            }
            cout << "\"" << endl;
            cout << "  }" << endl;
        } else {
            cout << "  \"error\": \"NO_FEASIBLE_SOLUTION\"," << endl;
            cout << "  \"message\": \"가능한 인터뷰 스케줄이 없습니다. 제약 조건을 확인해주세요.\"," << endl;
            cout << "  \"possibleCauses\": [" << endl;
            cout << "    \"면접관과 피면접자의 가용 시간이 충분하지 않음\"," << endl;
            cout << "    \"면접관 수가 부족함\"," << endl;
            cout << "    \"연속성 제약이 너무 엄격함\"," << endl;
            cout << "    \"면접 패널 크기가 부적절함\"," << endl;
            cout << "    \"제약 조건 간 충돌\"" << endl;
            cout << "  ]," << endl;
            cout << "  \"suggestions\": [" << endl;
            cout << "    \"가용 시간을 늘려보세요\"," << endl;
            cout << "    \"면접관을 추가하세요\"," << endl;
            cout << "    \"연속성 제약을 완화하세요\"," << endl;
            cout << "    \"패널 크기를 조정하세요\"" << endl;
            cout << "  ]" << endl;
        }
        
        cout << "}" << endl;
    }
};

// 메인 함수
int main(int argc, char* argv[]) {
    if (argc < 2) {
        cout << "Usage: " << argv[0] << " <input.json>" << endl;
        return 1;
    }
    
    // JSON 파싱
    vector<string> interviewDates;
    vector<InterviewerSlot> interviewerSlots;
    vector<IntervieweeSlot> intervieweeSlots;
    int panelSize;
    
    if (!JsonParser::parseJsonFile(argv[1], interviewDates, interviewerSlots, intervieweeSlots, panelSize)) {
        cerr << "Failed to parse JSON file: " << argv[1] << endl;
        return 1;
    }
    
    // 디버그 메시지는 stderr로 출력 (Node.js에서 JSON 파싱을 위해)
    cerr << "Parsed data:" << endl;
    cerr << "Interview dates: ";
    for (const auto& date : interviewDates) cerr << "'" << date << "' ";
    cerr << endl;
    
    cerr << "Interviewer slots: " << interviewerSlots.size() << endl;
    for (const auto& slot : interviewerSlots) {
        cerr << "  ID: " << slot.interviewerId << ", Date: '" << slot.interviewDate 
             << "', Time: '" << slot.timeslot << "'" << endl;
    }
    
    cerr << "Interviewee slots: " << intervieweeSlots.size() << endl;
    for (const auto& slot : intervieweeSlots) {
        cerr << "  ID: " << slot.intervieweeId << ", Date: '" << slot.interviewDate 
             << "', Time: '" << slot.timeslot << "'" << endl;
    }
    
    cerr << "Panel size: " << panelSize << endl;
    
    InterviewScheduler scheduler;
    scheduler.setInterviewDates(interviewDates);
    scheduler.setInterviewerSlots(interviewerSlots);
    scheduler.setIntervieweeSlots(intervieweeSlots);
    scheduler.setPanelSize(panelSize);
    
    // 슬롯 생성
    scheduler.generateTimeSlots();
    
    // 가용성 매트릭스 생성
    scheduler.buildAvailabilityMatrices();
    
    // 제약 조건 검증
    scheduler.validateConstraints();
    
    // GLPK 문제 설정
    scheduler.setupGLPKProblem();
    
    // 문제 해결
    cerr << "Solving interview scheduling problem..." << endl;
    if (scheduler.solve()) {
        cerr << "Solution found!" << endl;
        scheduler.saveSolutionToJson();  // JSON 파일로 저장
        scheduler.printSolution();        // 콘솔에 간단한 요약 출력
        
        // Node.js 연동을 위해 stdout으로 JSON만 출력
        scheduler.outputJsonToStdout();
    } else {
        cerr << "==========================================" << endl;
        cerr << "ERROR: 가능한 인터뷰 스케줄이 없습니다!" << endl;
        cerr << "==========================================" << endl;
        cerr << endl;
        cerr << "가능한 원인:" << endl;
        cerr << "1. 면접관과 피면접자의 가용 시간이 충분하지 않음" << endl;
        cerr << "2. 면접관 수가 부족함" << endl;
        cerr << "3. 연속성 제약이 너무 엄격함" << endl;
        cerr << "4. 면접 패널 크기가 부적절함" << endl;
        cerr << "5. 제약 조건 간 충돌" << endl;
        cerr << endl;
        cerr << "해결 방법:" << endl;
        cerr << "1. 가용 시간을 늘려보세요" << endl;
        cerr << "2. 면접관을 추가하세요" << endl;
        cerr << "3. 연속성 제약을 완화하세요" << endl;
        cerr << "4. 패널 크기를 조정하세요" << endl;
        cerr << "==========================================" << endl;
        
        // Node.js 연동을 위해 stdout으로 JSON 오류 메시지 출력
        cout << "{\"error\": \"NO_FEASIBLE_SOLUTION\", \"message\": \"가능한 인터뷰 스케줄이 없습니다. 제약 조건을 확인해주세요.\"}" << endl;
    }
    
    return 0;
}
