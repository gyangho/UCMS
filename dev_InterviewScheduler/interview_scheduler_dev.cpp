#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <glpk.h>
#include <iomanip>
#include <cmath>

using namespace std;

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
        
        if (value.length() >= 2 && value[0] == '"' && value[value.length()-1] == '"') {
            value = value.substr(1, value.length() - 2);
        }
        
        if (!value.empty() && value[value.length()-1] == ',') {
            value = value.substr(0, value.length() - 1);
        }
        
        size_t extraPos = value.find("\"");
        if (extraPos != string::npos) {
            value = value.substr(0, extraPos);
        }
        
        return trim(value);
    }
    
    static int extractIntValue(const string& line) {
        string value = extractValue(line);
        if (value.empty()) return 0;
        
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
                    
                    size_t start = 0;
                    while (start < interviewerSection.length()) {
                        size_t braceStart = interviewerSection.find("{", start);
                        if (braceStart == string::npos) break;
                        size_t braceEnd = interviewerSection.find("}", braceStart);
                        if (braceEnd == string::npos) break;
                        
                        string obj = interviewerSection.substr(braceStart, braceEnd - braceStart + 1);
                        InterviewerSlot slot;
                        
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
                        
                        size_t datePos = obj.find("\"interviewDate\":");
                        if (datePos != string::npos) {
                            size_t valueStart = obj.find(":", datePos) + 1;
                            valueStart = obj.find("\"", valueStart) + 1;
                            size_t valueEnd = obj.find("\"", valueStart);
                            if (valueEnd != string::npos) {
                                slot.interviewDate = obj.substr(valueStart, valueEnd - valueStart);
                            }
                        }
                        
                        size_t timePos = obj.find("\"timeslot\":");
                        if (timePos == string::npos) {
                            timePos = obj.find("\"timeSlot\":");
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
                    
                    size_t start = 0;
                    while (start < intervieweeSection.length()) {
                        size_t braceStart = intervieweeSection.find("{", start);
                        if (braceStart == string::npos) break;
                        size_t braceEnd = intervieweeSection.find("}", braceStart);
                        if (braceEnd == string::npos) break;
                        
                        string obj = intervieweeSection.substr(braceStart, braceEnd - braceStart + 1);
                        IntervieweeSlot slot;
                        
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
                        
                        size_t datePos = obj.find("\"interviewDate\":");
                        if (datePos != string::npos) {
                            size_t valueStart = obj.find(":", datePos) + 1;
                            valueStart = obj.find("\"", valueStart) + 1;
                            size_t valueEnd = obj.find("\"", valueStart);
                            if (valueEnd != string::npos) {
                                slot.interviewDate = obj.substr(valueStart, valueEnd - valueStart);
                            }
                        }
                        
                        size_t timePos = obj.find("\"timeslot\":");
                        if (timePos == string::npos) {
                            timePos = obj.find("\"timeSlot\":");
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
    int panelSize;
    
    vector<string> allSlots;
    unordered_map<string, int> slotToIndex;
    unordered_map<int, string> indexToSlot;
    
    // 시간대 그룹 정보 (시간대 일관성 제약용)
    unordered_map<string, vector<int>> hourGroups;
    
    // 시간대별 고정된 면접관 그룹 (시간대 일관성 강화용)
    unordered_map<string, vector<int>> fixedInterviewerGroups;
    
    vector<int> interviewerIds;
    vector<int> intervieweeIds;
    unordered_map<int, vector<int>> interviewerAvailability;
    unordered_map<int, vector<int>> intervieweeAvailability;
    
    glp_prob *lp;
    
public:
    InterviewScheduler() : lp(nullptr) {}
    
    ~InterviewScheduler() {
        if (lp) {
            glp_delete_prob(lp);
        }
    }
    
    void setInterviewDates(const vector<string>& dates) { interviewDates = dates; }
    void setInterviewerSlots(const vector<InterviewerSlot>& slots) { interviewerSlots = slots; }
    void setIntervieweeSlots(const vector<IntervieweeSlot>& slots) { intervieweeSlots = slots; }
    void setPanelSize(int size) { panelSize = size; }
    
    // 15분 슬롯을 1시간 단위로 그룹핑하는 함수
    string getHourGroup(const string& quarterSlot) {
        size_t spacePos = quarterSlot.find(" ");
        if (spacePos == string::npos) return "";
        
        string date = quarterSlot.substr(0, spacePos);
        string timeRange = quarterSlot.substr(spacePos + 1);
        
        size_t tildePos = timeRange.find("~");
        if (tildePos == string::npos) return "";
        
        string startTime = timeRange.substr(0, tildePos);
        size_t colonPos = startTime.find(":");
        if (colonPos == string::npos) return "";
        
        int startHour = stoi(startTime.substr(0, colonPos));
        string startMinute = startTime.substr(colonPos + 1);
        
        stringstream ss;
        ss << date << " " << setfill('0') << setw(2) << startHour << ":00~"
           << setfill('0') << setw(2) << (startHour + 1) << ":00";
        
        return ss.str();
    }
    
    // 슬롯 생성
    void generateTimeSlots() {
        allSlots.clear();
        slotToIndex.clear();
        indexToSlot.clear();
        
        unordered_map<string, bool> uniqueHourSlots;
        
        for (const auto& slot : interviewerSlots) {
            string fullSlot = slot.interviewDate + " " + slot.timeslot;
            uniqueHourSlots[fullSlot] = true;
        }
        
        for (const auto& slot : intervieweeSlots) {
            string fullSlot = slot.interviewDate + " " + slot.timeslot;
            uniqueHourSlots[fullSlot] = true;
        }
        
        vector<string> sortedHourSlots;
        for (const auto& pair : uniqueHourSlots) {
            sortedHourSlots.push_back(pair.first);
        }
        sort(sortedHourSlots.begin(), sortedHourSlots.end());
        
        int slotIndex = 0;
        for (const string& hourSlot : sortedHourSlots) {
            size_t spacePos = hourSlot.find(" ");
            if (spacePos != string::npos) {
                string date = hourSlot.substr(0, spacePos);
                string timeRange = hourSlot.substr(spacePos + 1);
                
                size_t tildePos = timeRange.find("~");
                if (tildePos != string::npos) {
                    string startTime = timeRange.substr(0, tildePos);
                    string endTime = timeRange.substr(tildePos + 1);
                    
                    size_t colonPos = startTime.find(":");
                    if (colonPos != string::npos) {
                        int startHour = stoi(startTime.substr(0, colonPos));
                        int startMinute = stoi(startTime.substr(colonPos + 1));
                        
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
        
        // 시간대별 그룹 생성
        for (size_t s = 0; s < allSlots.size(); s++) {
            string hourGroup = getHourGroup(allSlots[s]);
            if (!hourGroup.empty()) {
                hourGroups[hourGroup].push_back(static_cast<int>(s));
            }
        }
    }
    
    // 가용성 매트릭스 생성
    void buildAvailabilityMatrices() {
        unordered_map<int, bool> seenInterviewers;
        for (const auto& slot : interviewerSlots) {
            if (!seenInterviewers[slot.interviewerId]) {
                interviewerIds.push_back(slot.interviewerId);
                seenInterviewers[slot.interviewerId] = true;
            }
        }
        
        unordered_map<int, bool> seenInterviewees;
        for (const auto& slot : intervieweeSlots) {
            if (!seenInterviewees[slot.intervieweeId]) {
                intervieweeIds.push_back(slot.intervieweeId);
                seenInterviewees[slot.intervieweeId] = true;
            }
        }
        
        for (int interviewerId : interviewerIds) {
            vector<int> availability(allSlots.size(), 0);
            
            for (const auto& slot : interviewerSlots) {
                if (slot.interviewerId == interviewerId) {
                    string fullSlot = slot.interviewDate + " " + slot.timeslot;
                    
                    for (size_t i = 0; i < allSlots.size(); i++) {
                        string quarterSlot = allSlots[i];
                        
                        if (isSlotInHourRange(quarterSlot, fullSlot)) {
                            availability[i] = 1;
                        }
                    }
                }
            }
            interviewerAvailability[interviewerId] = availability;
        }
        
        for (int intervieweeId : intervieweeIds) {
            vector<int> availability(allSlots.size(), 0);
            
            for (const auto& slot : intervieweeSlots) {
                if (slot.intervieweeId == intervieweeId) {
                    string fullSlot = slot.interviewDate + " " + slot.timeslot;
                    
                    for (size_t i = 0; i < allSlots.size(); i++) {
                        string quarterSlot = allSlots[i];
                        
                        if (isSlotInHourRange(quarterSlot, fullSlot)) {
                            availability[i] = 1;
                        }
                    }
                }
            }
            intervieweeAvailability[intervieweeId] = availability;
        }
    }
    
    // 15분 슬롯이 1시간 슬롯 내에 포함되는지 확인
    bool isSlotInHourRange(const string& quarterSlot, const string& hourSlot) {
        size_t spacePos1 = quarterSlot.find(" ");
        size_t spacePos2 = hourSlot.find(" ");
        if (spacePos1 == string::npos || spacePos2 == string::npos) return false;
        
        string date1 = quarterSlot.substr(0, spacePos1);
        string date2 = hourSlot.substr(0, spacePos2);
        if (date1 != date2) return false;
        
        string timeRange1 = quarterSlot.substr(spacePos1 + 1);
        string timeRange2 = hourSlot.substr(spacePos2 + 1);
        
        size_t tildePos1 = timeRange1.find("~");
        if (tildePos1 == string::npos) return false;
        string startTime1 = timeRange1.substr(0, tildePos1);
        
        size_t tildePos2 = timeRange2.find("~");
        if (tildePos2 == string::npos) return false;
        string startTime2 = timeRange2.substr(0, tildePos2);
        string endTime2 = timeRange2.substr(tildePos2 + 1);
        
        return startTime1 >= startTime2 && startTime1 < endTime2;
    }
    
    // 실제 가능한 경우의 수 계산
    int calculateTotalPossibleCombinations() {
        long long totalCombinations = 1;
        
        cerr << "Calculating possible combinations for " << hourGroups.size() << " hour groups..." << endl;
        
        // 사용 가능한 시간대만 필터링
        vector<pair<string, vector<int>>> validGroups;
        
        for (const auto& group : hourGroups) {
            string hourKey = group.first;
            vector<int> slotIndices = group.second;
            
            vector<int> availableInterviewers;
            for (int interviewerId : interviewerIds) {
                bool isAvailable = false;
                
                for (int slotIndex : slotIndices) {
                    if (interviewerAvailability[interviewerId][slotIndex]) {
                        isAvailable = true;
                        break;
                    }
                }
                
                if (isAvailable) {
                    availableInterviewers.push_back(interviewerId);
                }
            }
            
            int availableCount = availableInterviewers.size();
            cerr << "Hour group " << hourKey << ": " << availableCount << " available interviewers, need " << panelSize << endl;
            
            if (availableCount >= panelSize) {
                long long combinations = 1;
                for (int i = 0; i < panelSize; i++) {
                    combinations *= (availableCount - i);
                }
                for (int i = 1; i <= panelSize; i++) {
                    combinations /= i;
                }
                
                if (combinations > 0 && totalCombinations > 0 && 
                    combinations > LLONG_MAX / totalCombinations) {
                    totalCombinations = 1000;
                    break;
                }
                
                totalCombinations *= combinations;
                validGroups.push_back({hourKey, slotIndices});
                cerr << "  Combinations for this group: " << combinations << endl;
            } else {
                cerr << "  WARNING: Not enough interviewers for " << hourKey << " - skipping this time slot" << endl;
            }
        }
        
        // 유효한 그룹만 사용하도록 hourGroups 업데이트
        hourGroups.clear();
        for (const auto& group : validGroups) {
            hourGroups[group.first] = group.second;
        }
        
        cerr << "Valid hour groups: " << hourGroups.size() << " out of " << (hourGroups.size() + (hourGroups.size() - validGroups.size())) << endl;
        
        if (totalCombinations > 1000) {
            cerr << "Limiting to 1000 attempts" << endl;
            return 1000;
        }
        
        if (totalCombinations <= 0) {
            cerr << "Invalid combination count, using default limit" << endl;
            return 1000;
        }
        
        cerr << "Total possible combinations: " << totalCombinations << endl;
        return static_cast<int>(totalCombinations);
    }
    
    // 시간대별 면접관 그룹을 고정시키는 메서드 (전략 기반)
    void fixInterviewerGroupsByTime(int strategy = 0) {
        int numInterviewers = interviewerIds.size();
        int panelSize = this->panelSize;
        
        cerr << "  Using strategy " << strategy << " (";
        switch (strategy % 5) {
            case 0: cerr << "Most available time first"; break;
            case 1: cerr << "Least available time first"; break;
            case 2: cerr << "Sequential order"; break;
            case 3: cerr << "Alternating even/odd"; break;
            case 4: cerr << "Load balancing"; break;
        }
        cerr << ")" << endl;
        
        int processedGroups = 0;
        cerr << "  Processing " << hourGroups.size() << " hour groups..." << endl;
        
        for (const auto& group : hourGroups) {
            if (group.second.size() > 1) {
                string hourKey = group.first;
                processedGroups++;
                
                cerr << "    Processing group " << processedGroups << ": " << hourKey << " (slots: " << group.second.size() << ")" << endl;
                
                vector<int> availableInterviewers;
                for (int i = 0; i < numInterviewers; i++) {
                    int interviewerId = interviewerIds[i];
                    bool isAvailable = false;
                    
                    for (int slotIndex : group.second) {
                        if (interviewerAvailability[interviewerId][slotIndex]) {
                            isAvailable = true;
                            break;
                        }
                    }
                    
                    if (isAvailable) {
                        availableInterviewers.push_back(interviewerId);
                    }
                }
                
                if (static_cast<int>(availableInterviewers.size()) >= panelSize) {
                    vector<int> selectedInterviewers;
                    
                    switch (strategy % 5) {
                        case 0: {
                            sort(availableInterviewers.begin(), availableInterviewers.end(),
                                 [this, &group](int a, int b) {
                                     int countA = 0, countB = 0;
                                     for (int slotIndex : group.second) {
                                         if (interviewerAvailability[a][slotIndex]) countA++;
                                         if (interviewerAvailability[b][slotIndex]) countB++;
                                     }
                                     return countA > countB;
                                 });
                            break;
                        }
                        case 1: {
                            sort(availableInterviewers.begin(), availableInterviewers.end(),
                                 [this, &group](int a, int b) {
                                     int countA = 0, countB = 0;
                                     for (int slotIndex : group.second) {
                                         if (interviewerAvailability[a][slotIndex]) countA++;
                                         if (interviewerAvailability[b][slotIndex]) countB++;
                                     }
                                     return countA < countB;
                                 });
                            break;
                        }
                        case 2: break;
                        case 3: {
                            vector<int> evenIds, oddIds;
                            for (int id : availableInterviewers) {
                                if (id % 2 == 0) evenIds.push_back(id);
                                else oddIds.push_back(id);
                            }
                            availableInterviewers.clear();
                            availableInterviewers.insert(availableInterviewers.end(), evenIds.begin(), evenIds.end());
                            availableInterviewers.insert(availableInterviewers.end(), oddIds.begin(), oddIds.end());
                            break;
                        }
                        case 4: {
                            sort(availableInterviewers.begin(), availableInterviewers.end(),
                                 [this](int a, int b) {
                                     int countA = getCurrentInterviewCount(a);
                                     int countB = getCurrentInterviewCount(b);
                                     return countA < countB;
                                 });
                            break;
                        }
                    }
                    
                    for (int i = 0; i < panelSize && i < static_cast<int>(availableInterviewers.size()); i++) {
                        selectedInterviewers.push_back(availableInterviewers[i]);
                    }
                    
                    fixedInterviewerGroups[hourKey] = selectedInterviewers;
                    cerr << "    [" << processedGroups << "/" << hourGroups.size() << "] " << hourKey 
                         << ": " << selectedInterviewers.size() << " interviewers selected" << endl;
                } else {
                    cerr << "    [" << processedGroups << "/" << hourGroups.size() << "] " << hourKey 
                         << ": WARNING - need " << panelSize << ", available " << availableInterviewers.size() << endl;
                }
            }
        }
        
        cerr << "  Completed: " << fixedInterviewerGroups.size() << " groups fixed" << endl;
    }
    
    // 현재 면접관의 면접 횟수 계산 (안전장치 추가)
    int getCurrentInterviewCount(int interviewerId) {
        int count = 0;
        int maxIterations = 1000; // 안전장치
        int iterations = 0;
        
        for (const auto& group : fixedInterviewerGroups) {
            if (++iterations > maxIterations) {
                cerr << "    WARNING: getCurrentInterviewCount exceeded max iterations for interviewer " << interviewerId << endl;
                break;
            }
            for (int id : group.second) {
                if (id == interviewerId) count++;
            }
        }
        return count;
    }
    
    // 공정성 점수 계산 (높을수록 좋음)
    double calculateFairnessScore() {
        if (fixedInterviewerGroups.empty()) return -1.0;
        
        unordered_map<int, int> interviewerCounts;
        for (const auto& group : fixedInterviewerGroups) {
            for (int id : group.second) {
                interviewerCounts[id]++;
            }
        }
        
        if (interviewerCounts.empty()) return -1.0;
        
        double sum = 0.0;
        for (const auto& pair : interviewerCounts) {
            sum += pair.second;
        }
        double mean = sum / interviewerCounts.size();
        
        double variance = 0.0;
        for (const auto& pair : interviewerCounts) {
            variance += pow(pair.second - mean, 2);
        }
        variance /= interviewerCounts.size();
        double stdDev = sqrt(variance);
        
        double fairnessScore = 100.0 / (1.0 + stdDev);
        
        return fairnessScore;
    }
    
    // 고정된 면접관 그룹에 따른 강제 제약 추가
    void addFixedGroupConstraints() {
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int yOffset = 1 + intervieweeIds.size() * numSlots;
        
        for (const auto& fixedGroup : fixedInterviewerGroups) {
            string hourKey = fixedGroup.first;
            const vector<int>& selectedInterviewers = fixedGroup.second;
            
            auto it = hourGroups.find(hourKey);
            if (it != hourGroups.end()) {
                for (int slotIndex : it->second) {
                    for (int i = 0; i < numInterviewers; i++) {
                        int interviewerId = interviewerIds[i];
                        bool isSelected = false;
                        
                        for (int selectedId : selectedInterviewers) {
                            if (interviewerId == selectedId) {
                                isSelected = true;
                                break;
                            }
                        }
                        
                        if (!isSelected) {
                            int varIndex = yOffset + i * numSlots + slotIndex;
                            glp_set_col_bnds(lp, varIndex, GLP_FX, 0.0, 0.0);
                            
                            int zOffset = 1 + static_cast<int>(intervieweeIds.size()) * numSlots + static_cast<int>(interviewerIds.size()) * numSlots;
                            for (size_t c = 0; c < intervieweeIds.size(); c++) {
                                int zIndex = zOffset + static_cast<int>(c) * static_cast<int>(interviewerIds.size()) * numSlots + i * numSlots + slotIndex;
                                glp_set_col_bnds(lp, zIndex, GLP_FX, 0.0, 0.0);
                            }
                        } else {
                            int varIndex = yOffset + i * numSlots + slotIndex;
                            glp_set_col_bnds(lp, varIndex, GLP_FX, 1.0, 1.0);
                        }
                    }
                }
            }
        }
        
        for (int i = 0; i < numInterviewers; i++) {
            int interviewerId = interviewerIds[i];
            
            int assignedTimeSlots = 0;
            for (const auto& fixedGroup : fixedInterviewerGroups) {
                for (int selectedId : fixedGroup.second) {
                    if (selectedId == interviewerId) {
                        assignedTimeSlots++;
                        break;
                    }
                }
            }
            
            if (assignedTimeSlots == 0) {
                for (int s = 0; s < numSlots; s++) {
                    int varIndex = yOffset + i * numSlots + s;
                    glp_set_col_bnds(lp, varIndex, GLP_FX, 0.0, 0.0);
                }
            }
        }
    }
    
    // GLPK 문제 초기화 (다음 시도를 위해)
    void resetGLPKProblem() {
        if (lp) {
            glp_delete_prob(lp);
            lp = nullptr;
        }
        setupGLPKProblem();
    }
    
    // 반복 스케줄링: 모든 경우의 수를 시도하고 최고 공정성 점수 선택
    void scheduleWithIterativeApproach() {
        int maxAttempts = calculateTotalPossibleCombinations();
        double bestFairnessScore = -1.0;
        unordered_map<string, vector<int>> bestGroups;
        vector<InterviewAssignment> bestSolution;
        bool foundFeasibleSolution = false;
        
        if (maxAttempts <= 0) {
            cerr << "ERROR: No valid combinations possible. Check interviewer availability." << endl;
            return;
        }
        
        cerr << "Starting iterative scheduling with " << maxAttempts << " attempts..." << endl;
        cerr << "Memory usage check - hourGroups size: " << hourGroups.size() << endl;
        
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            cerr << "\n--- Attempt " << attempt << "/" << maxAttempts << " (" 
                 << (attempt * 100 / maxAttempts) << "%) ---" << endl;
            
            // 1단계: 면접관 그룹 고정
            fixInterviewerGroupsByTime(attempt % 5);
            
            // 2단계: GLPK 문제 설정
            cerr << "    Setting up GLPK problem..." << endl;
            resetGLPKProblem();
            addFixedGroupConstraints();
            cerr << "    GLPK problem setup completed" << endl;
            
            // 3단계: 문제 해결
            cerr << "    Starting optimization process..." << endl;
            if (solve()) {
                foundFeasibleSolution = true;
                
                // 4단계: 공정성 점수 계산
                cerr << "    Calculating fairness score..." << endl;
                double currentFairnessScore = calculateFairnessScore();
                cerr << "    Fairness score: " << currentFairnessScore << endl;
                
                if (currentFairnessScore > bestFairnessScore) {
                    bestFairnessScore = currentFairnessScore;
                    bestGroups = fixedInterviewerGroups;
                    bestSolution = getSolution();
                    cerr << "  ✓ NEW BEST: Attempt " << attempt << " achieved fairness score: " << bestFairnessScore << endl;
                } else {
                    cerr << "  - Attempt " << attempt << " fairness score: " << currentFairnessScore 
                         << " (best: " << bestFairnessScore << ")" << endl;
                }
            } else {
                cerr << "   Attempt " << attempt << " failed to solve" << endl;
            }
            
            // 진행 상황 요약 (5번째 시도마다 또는 마지막 시도) - 더 자주 출력
            if (attempt % 5 == 0 || attempt == maxAttempts) {
                cerr << "\n=== Progress Summary (Attempt " << attempt << "/" << maxAttempts << ") ===" << endl;
                cerr << "  Feasible solutions found: " << (foundFeasibleSolution ? "YES" : "NO") << endl;
                cerr << "  Best fairness score so far: " << bestFairnessScore << endl;
                cerr << "  Success rate: " << (attempt > 0 ? (foundFeasibleSolution ? "100%" : "0%") : "N/A") << endl;
                cerr << "=====================================" << endl;
            }
        }
        
        // 최고 공정성 그룹으로 최종 결과 생성
        if (foundFeasibleSolution) {
            cerr << "Best fairness score achieved: " << bestFairnessScore << endl;
            fixedInterviewerGroups = bestGroups;
            resetGLPKProblem();
            addFixedGroupConstraints();
            
            if (solve()) {
                bestSolution = getSolution();
                cerr << "Final solution found with " << bestSolution.size() << " assignments" << endl;
            } else {
                cerr << "Failed to solve with best groups" << endl;
            }
        } else {
            cerr << "No feasible solution found in any attempt" << endl;
        }
    }
    
    // GLPK 문제 설정
    void setupGLPKProblem() {
        lp = glp_create_prob();
        glp_set_prob_name(lp, "Interview_Scheduling");
        glp_set_obj_dir(lp, GLP_MIN);
        
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int numInterviewees = intervieweeIds.size();
        
        int numVars = numInterviewees * numSlots + numInterviewers * numSlots + 
                      numInterviewees * numInterviewers * numSlots;
        
        if (numVars <= 0) {
            cerr << "ERROR: Invalid number of variables: " << numVars << endl;
            return;
        }
        
        glp_add_cols(lp, numVars);
        
        for (int varIndex = 1; varIndex <= numVars; varIndex++) {
            glp_set_obj_coef(lp, varIndex, 0.0);
        }
        
        int varIndex = 1;
        
        // x[c][s] 변수 (후보자 배정)
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                string name = "x_" + to_string(intervieweeIds[c]) + "_" + to_string(s);
                glp_set_col_name(lp, varIndex, name.c_str());
                glp_set_col_kind(lp, varIndex, GLP_BV);
                glp_set_col_bnds(lp, varIndex, GLP_DB, 0.0, 1.0);
                varIndex++;
            }
        }
        
        // y[i][s] 변수 (면접관 면접)
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                string name = "y_" + to_string(interviewerIds[i]) + "_" + to_string(s);
                glp_set_col_name(lp, varIndex, name.c_str());
                glp_set_col_kind(lp, varIndex, GLP_BV);
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
                    glp_set_col_kind(lp, varIndex, GLP_BV);
                    glp_set_col_bnds(lp, varIndex, GLP_DB, 0.0, 1.0);
                    varIndex++;
                }
            }
        }
        
        setupConstraints();
    }
    
    // 제약 조건 설정
    void setupConstraints() {
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int numInterviewees = intervieweeIds.size();
        
        int numConstraints = numInterviewees + numInterviewees * numSlots + numSlots + 
                           numInterviewers * numSlots + numInterviewees * numSlots + 
                           numInterviewers * numSlots;
        
        glp_add_rows(lp, numConstraints);
        
        int constraintIndex = 1;
        
        // 1. 각 후보자는 정확히 한 슬롯에 배정
        for (int c = 0; c < numInterviewees; c++) {
            glp_set_row_name(lp, constraintIndex, ("candidate_" + to_string(intervieweeIds[c])).c_str());
            glp_set_row_bnds(lp, constraintIndex, GLP_FX, 1.0, 1.0);
            constraintIndex++;
        }
        
        // 2. 각 슬롯에 배정된 후보자당 정확히 n명의 면접관 필요
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                glp_set_row_name(lp, constraintIndex, 
                    ("panel_" + to_string(intervieweeIds[c]) + "_" + to_string(s)).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_FX, 0.0, 0.0);
                constraintIndex++;
            }
        }
        
        // 3. 각 슬롯에는 최대 1명의 피면접자만 배정
        for (int s = 0; s < numSlots; s++) {
            glp_set_row_name(lp, constraintIndex, ("slot_limit_" + to_string(s)).c_str());
            glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 1.0);
            constraintIndex++;
        }
        
        // 4. 면접관은 한 슬롯에 최대 1명의 후보자만 면접
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                glp_set_row_name(lp, constraintIndex, 
                    ("interviewer_limit_" + to_string(interviewerIds[i]) + "_" + to_string(s)).c_str());
                glp_set_row_bnds(lp, constraintIndex, GLP_UP, 0.0, 1.0);
                constraintIndex++;
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
        
        setupConstraintCoefficients();
    }
    
    // 제약 조건 계수 설정
    void setupConstraintCoefficients() {
        int numSlots = allSlots.size();
        int numInterviewers = interviewerIds.size();
        int numInterviewees = intervieweeIds.size();
        
        int xOffset = 1;
        int yOffset = numInterviewees * numSlots + 1;
        int zOffset = yOffset + numInterviewers * numSlots;
        
        int constraintIndex = 1;
        
        // 1. 각 후보자는 정확히 한 슬롯에 배정
        for (int c = 0; c < numInterviewees; c++) {
            int* indices = new int[1 + numSlots];
            double* values = new double[1 + numSlots];
            
            for (int s = 0; s < numSlots; s++) {
                int varIndex = xOffset + c * numSlots + s;
                indices[s + 1] = varIndex;
                values[s + 1] = 1.0;
            }
            
            glp_set_mat_row(lp, constraintIndex, numSlots, indices, values);
            constraintIndex++;
            
            delete[] indices;
            delete[] values;
        }
        
        // 2. 각 슬롯에 배정된 후보자당 정확히 n명의 면접관 필요
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                int numCoeffs = 1 + numInterviewers;
                int* indices = new int[1 + numCoeffs];
                double* values = new double[1 + numCoeffs];
                
                int coeffIndex = 1;
                
                int xIndex = xOffset + c * numSlots + s;
                indices[coeffIndex] = xIndex;
                values[coeffIndex] = -panelSize;
                coeffIndex++;
                
                for (int i = 0; i < numInterviewers; i++) {
                    int zIndex = zOffset + c * numInterviewers * numSlots + i * numSlots + s;
                    indices[coeffIndex] = zIndex;
                    values[coeffIndex] = 1.0;
                    coeffIndex++;
                }
                
                glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
                constraintIndex++;
                
                delete[] indices;
                delete[] values;
            }
        }
        
        // 3. 각 슬롯에는 최대 1명의 피면접자만 배정
        for (int s = 0; s < numSlots; s++) {
            int numCoeffs = numInterviewees;
            int* indices = new int[1 + numCoeffs];
            double* values = new double[1 + numCoeffs];
            
            int coeffIndex = 1;
            
            for (int c = 0; c < numInterviewees; c++) {
                int xIndex = xOffset + c * numSlots + s;
                indices[coeffIndex] = xIndex;
                values[coeffIndex] = 1.0;
                coeffIndex++;
            }
            
            glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
            constraintIndex++;
            
            delete[] indices;
            delete[] values;
        }
        
        // 4. 면접관은 한 슬롯에 최대 1명의 후보자만 면접
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                int numCoeffs = 1 + numInterviewees;
                int* indices = new int[1 + numCoeffs];
                double* values = new double[1 + numCoeffs];
                
                int coeffIndex = 1;
                
                int yIndex = yOffset + i * numSlots + s;
                indices[coeffIndex] = yIndex;
                values[coeffIndex] = -1.0;
                coeffIndex++;
                
                for (int c = 0; c < numInterviewees; c++) {
                    int zIndex = zOffset + c * numInterviewers * numSlots + i * numSlots + s;
                    indices[coeffIndex] = zIndex;
                    values[coeffIndex] = 1.0;
                    coeffIndex++;
                }
                
                glp_set_mat_row(lp, constraintIndex, numCoeffs, indices, values);
                constraintIndex++;
                
                delete[] indices;
                delete[] values;
            }
        }
        
        // 5. 가용성 제약
        for (int c = 0; c < numInterviewees; c++) {
            for (int s = 0; s < numSlots; s++) {
                int xIndex = xOffset + c * numSlots + s;
                int indices[2] = {0, xIndex};
                double values[2] = {0.0, 1.0};
                glp_set_mat_row(lp, constraintIndex, 1, indices, values);
                constraintIndex++;
            }
        }
        
        for (int i = 0; i < numInterviewers; i++) {
            for (int s = 0; s < numSlots; s++) {
                int yIndex = yOffset + i * numSlots + s;
                int indices[2] = {0, yIndex};
                double values[2] = {0.0, 1.0};
                glp_set_mat_row(lp, constraintIndex, 1, indices, values);
                constraintIndex++;
            }
        }
    }
    
    // 문제 해결
    bool solve() {
        if (!lp) {
            return false;
        }
        
        cerr << "    Solving GLPK problem..." << endl;
        
        // Step 1: Simplex 알고리즘
        cerr << "    Step 1/2: Running Simplex algorithm..." << endl;
        glp_smcp smcp;
        glp_init_smcp(&smcp);
        smcp.msg_lev = GLP_MSG_ERR;
        smcp.presolve = GLP_ON;
        smcp.tm_lim = 30000;
        
        int ret = glp_simplex(lp, &smcp);
        if (ret != 0) {
            cerr << "     ✗ Simplex failed with code: " << ret << endl;
            return false;
        }
        
        int simplex_status = glp_get_status(lp);
        if (simplex_status != GLP_OPT) {
            cerr << "     ✗ Simplex did not find optimal solution. Status: " << simplex_status << endl;
            return false;
        }
        
        cerr << "     ✓ Simplex completed successfully" << endl;
        
        // Simplex에서 정수 해를 찾았는지 확인
        bool hasIntegerSolution = true;
        int numCols = glp_get_num_cols(lp);
        for (int i = 1; i <= numCols; i++) {
            double val = glp_get_col_prim(lp, i);
            if (abs(val - round(val)) > 1e-6) {
                hasIntegerSolution = false;
                break;
            }
        }
        
        if (hasIntegerSolution) {
            cerr << "     ✓ Simplex found integer solution - no need for integer optimization" << endl;
            return true;
        }
        
        // Step 2: Integer optimization
        cerr << "    Step 2/2: Running Integer optimization..." << endl;
        cerr << "    This step may take several minutes. Please wait..." << endl;
        
        glp_iocp iocp;
        glp_init_iocp(&iocp);
        iocp.msg_lev = GLP_MSG_ERR;
        iocp.tm_lim = 60000;
        iocp.mip_gap = 0.30;
        iocp.presolve = GLP_ON;
        iocp.binarize = GLP_ON;
        
        ret = glp_intopt(lp, &iocp);
        if (ret != 0) {
            cerr << "     ✗ Integer optimization failed with code: " << ret << endl;
            return false;
        }
        
        int mip_status = glp_mip_status(lp);
        if (mip_status == GLP_OPT || mip_status == GLP_FEAS) {
            cerr << "     ✓ Integer optimization completed successfully" << endl;
            return true;
        } else {
            cerr << "     ✗ Integer optimization failed. Status: " << mip_status << endl;
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
            
            bool slotFound = false;
            for (int s = 0; s < numSlots; s++) {
                int varIndex = c * numSlots + s + 1;
                double value = glp_mip_col_val(lp, varIndex);

                if (value > 0.5) {
                    assignment.slot = allSlots[s];
                    slotFound = true;
                    
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
            }
        }

        return assignments;
    }
    
    // 결과를 JSON 파일로 저장
    void saveSolutionToJson() {
        if (!lp) {
            return;
        }
        
        ofstream outFile("outputs/out.json");
        if (!outFile.is_open()) {
            cerr << "Cannot open output file: outputs/out.json" << endl;
            return;
        }
        
        outFile << "{" << endl;
        
        outFile << "  \"glpkStatus\": \"";
        switch (glp_mip_status(lp)) {
            case GLP_OPT: outFile << "OPTIMAL"; break;
            case GLP_FEAS: outFile << "FEASIBLE"; break;
            case GLP_INFEAS: outFile << "INFEASIBLE"; break;
            case GLP_NOFEAS: outFile << "NO_FEASIBLE_SOLUTION"; break;
            case GLP_UNBND: outFile << "UNBOUNDED"; break;
            case GLP_UNDEF: outFile << "UNDEFINED"; break;
            default: outFile << "UNKNOWN";
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
            outFile << "  ]" << endl;
            } else {
            outFile << "  \"error\": \"NO_FEASIBLE_SOLUTION\"" << endl;
        }
        
        outFile << "}" << endl;
        outFile.close();
    }

    // stdout으로 JSON 출력 (Node.js 연동용)
    void outputJsonToStdout() {
        if (!lp) {
            cout << "{\"error\": \"No problem to solve\"}" << endl;
            return;
        }
        
        cout << "{" << endl;
        
        cout << "  \"glpkStatus\": \"";
        switch (glp_mip_status(lp)) {
            case GLP_OPT: cout << "OPTIMAL"; break;
            case GLP_FEAS: cout << "FEASIBLE"; break;
            case GLP_INFEAS: cout << "INFEASIBLE"; break;
            case GLP_NOFEAS: cout << "NO_FEASIBLE_SOLUTION"; break;
            case GLP_UNBND: cout << "UNBOUNDED"; break;
            case GLP_UNDEF: cout << "UNDEFINED"; break;
            default: cout << "UNKNOWN";
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
            cout << "  ]" << endl;
            } else {
            cout << "  \"error\": \"NO_FEASIBLE_SOLUTION\"" << endl;
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
    
    vector<string> interviewDates;
    vector<InterviewerSlot> interviewerSlots;
    vector<IntervieweeSlot> intervieweeSlots;
    int panelSize;
    
    if (!JsonParser::parseJsonFile(argv[1], interviewDates, interviewerSlots, intervieweeSlots, panelSize)) {
        cerr << "Failed to parse JSON file: " << argv[1] << endl;
        return 1;
    }
    
    InterviewScheduler scheduler;
    scheduler.setInterviewDates(interviewDates);
    scheduler.setInterviewerSlots(interviewerSlots);
    scheduler.setIntervieweeSlots(intervieweeSlots);
    scheduler.setPanelSize(panelSize);
    
    scheduler.generateTimeSlots();
    scheduler.buildAvailabilityMatrices();
    scheduler.scheduleWithIterativeApproach(); // 반복 스케줄링 호출
    
    scheduler.saveSolutionToJson();
    scheduler.outputJsonToStdout();
    
    return 0;
}

