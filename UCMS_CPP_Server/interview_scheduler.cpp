// filename: interview_scheduler.cpp
// Requires: OR-Tools C++ (cp-sat) and nlohmann::json (single-header)
// Compile with CMake/Find OR-Tools or link libortools appropriately.

#include <bits/stdc++.h>
#include "ortools/sat/cp_model.h"
#include "nlohmann/json.hpp"

using json = nlohmann::json;
using namespace operations_research;
using namespace operations_research::sat;
using namespace std;

int main(int argc, char **argv)
{
  if (argc < 4)
  {
    cerr << "Usage: " << argv[0]
         << " input.json panel_size output.json\n"
            " input.json format:\n"
            "{\n"
            "  \"slots\": [\"8/21(목) 09:00~09:15\", ...],\n"
            "  \"interviewers\": [{\"id\":1, \"avail\":[\"8/21(목) 09:00~09:15\", ...]}, ...],\n"
            "  \"interviewees\": [{\"id\":101, \"avail\":[\"8/21(목) 09:00~09:15\", ...]}, ...]\n"
            "}\n";
    return 1;
  }

  const string infile = argv[1];
  const int panel_n = stoi(argv[2]);
  const string outfile = argv[3];

  // Read input JSON
  std::ifstream ifs(infile);
  if (!ifs.is_open())
  {
    cerr << "Cannot open " << infile << "\n";
    return 2;
  }
  json J;
  ifs >> J;

  vector<string> slots = J["slots"].get<vector<string>>();
  int S = (int)slots.size();

  // map slot string -> index
  unordered_map<string, int> slotIndex;
  for (int s = 0; s < S; ++s)
    slotIndex[slots[s]] = s;

  // Interviewers
  struct Intv
  {
    int id;
    vector<int> avail;
  };
  vector<Intv> interviewers;
  for (auto &it : J["interviewers"])
  {
    Intv iv;
    iv.id = it["id"].get<int>();
    for (auto &st : it["avail"])
    {
      string stt = st.get<string>();
      if (slotIndex.count(stt))
        iv.avail.push_back(slotIndex[stt]);
    }
    interviewers.push_back(move(iv));
  }
  int I = (int)interviewers.size();

  // Interviewees (candidates)
  struct Cand
  {
    int id;
    vector<int> avail;
  };
  vector<Cand> candidates;
  for (auto &it : J["interviewees"])
  {
    Cand c;
    c.id = it["id"].get<int>();
    for (auto &st : it["avail"])
    {
      string stt = st.get<string>();
      if (slotIndex.count(stt))
        c.avail.push_back(slotIndex[stt]);
    }
    candidates.push_back(move(c));
  }
  int C = (int)candidates.size();

  // Build availability matrices for quick checks
  vector<vector<int>> availI(I, vector<int>(S, 0));
  for (int i = 0; i < I; ++i)
    for (int s : interviewers[i].avail)
      availI[i][s] = 1;
  vector<vector<int>> availC(C, vector<int>(S, 0));
  for (int c = 0; c < C; ++c)
    for (int s : candidates[c].avail)
      availC[c][s] = 1;

  // CP-SAT model
  CpModelBuilder model;

  // x[c][s] : candidate c assigned to slot s
  vector<vector<BoolVar>> x(C, vector<BoolVar>(S));
  for (int c = 0; c < C; ++c)
    for (int s = 0; s < S; ++s)
      x[c][s] = model.NewBoolVar();

  // y[i][s] : interviewer i works at slot s
  vector<vector<BoolVar>> y(I, vector<BoolVar>(S));
  for (int i = 0; i < I; ++i)
    for (int s = 0; s < S; ++s)
      y[i][s] = model.NewBoolVar();

  // z[c][i][s] : candidate c is interviewed by interviewer i at slot s
  // Flatten as a vector of vectors for memory
  vector<vector<vector<BoolVar>>> z(C, vector<vector<BoolVar>>(I, vector<BoolVar>(S)));
  for (int c = 0; c < C; ++c)
    for (int i = 0; i < I; ++i)
      for (int s = 0; s < S; ++s)
        z[c][i][s] = model.NewBoolVar();

  // Availability constraints: zero out impossible x and z and y
  for (int c = 0; c < C; ++c)
    for (int s = 0; s < S; ++s)
      if (!availC[c][s])
        model.AddEquality(x[c][s], 0);
  for (int i = 0; i < I; ++i)
    for (int s = 0; s < S; ++s)
      if (!availI[i][s])
        model.AddEquality(y[i][s], 0);

  // Each candidate exactly one slot
  for (int c = 0; c < C; ++c)
  {
    LinearExpr sumx;
    for (int s = 0; s < S; ++s)
      sumx += x[c][s];
    model.AddEquality(sumx, 1);
  }

  // z linking:
  // 1) z[c][i][s] <= x[c][s], and <= y[i][s], and candidate/interviewer availability
  for (int c = 0; c < C; ++c)
    for (int i = 0; i < I; ++i)
      for (int s = 0; s < S; ++s)
      {
        model.AddLessOrEqual(z[c][i][s], x[c][s]);
        model.AddLessOrEqual(z[c][i][s], y[i][s]);
        if (!availC[c][s])
          model.AddEquality(z[c][i][s], 0);
        if (!availI[i][s])
          model.AddEquality(z[c][i][s], 0);
      }

  // 2) For each candidate&slot: sum_i z = n * x[c][s]
  for (int c = 0; c < C; ++c)
    for (int s = 0; s < S; ++s)
    {
      LinearExpr sumz;
      for (int i = 0; i < I; ++i)
        sumz += z[c][i][s];
      model.AddEquality(sumz, LinearExpr(x[c][s]) * panel_n);
    }

  // 3) For each interviewer&slot: sum_c z[c][i][s] == y[i][s]  (interviewer can interview at most 1 candidate in a slot)
  for (int i = 0; i < I; ++i)
    for (int s = 0; s < S; ++s)
    {
      LinearExpr sumzc;
      for (int c = 0; c < C; ++c)
        sumzc += z[c][i][s];
      model.AddEquality(sumzc, y[i][s]);
    }

  // Continuity constraint: if interviewer starts a session at s (i.e., y[i][s]==1 and previous slot is 0),
  // then sum_{t=s..s+3} y[i][t] >= 4
  // Encode using start[i][s] bool variable and linear relations
  vector<vector<BoolVar>> start(I, vector<BoolVar>(S));
  for (int i = 0; i < I; ++i)
    for (int s = 0; s < S; ++s)
      start[i][s] = model.NewBoolVar();

  for (int i = 0; i < I; ++i)
  {
    for (int s = 0; s < S; ++s)
    {
      if (s == 0)
      {
        // start >= y[i][0]
        model.AddGreaterOrEqual(LinearExpr(start[i][s]), LinearExpr(y[i][s]));
      }
      else
      {
        // start >= y[s] - y[s-1]
        // i.e., if y[s]==1 and y[s-1]==0 then start==1
        model.AddGreaterOrEqual(LinearExpr(start[i][s]), LinearExpr(y[i][s]) - LinearExpr(y[i][s - 1]));
      }

      // ensure start implies y[s]
      model.AddLessOrEqual(start[i][s], y[i][s]);
      // cannot start if previous slot is 1
      if (s > 0)
      {
        // start <= 1 - y[s-1]
        model.AddLessOrEqual(start[i][s], LinearExpr(1) - y[i][s - 1]);
      }

      // If starting at s, enforce a block of at least length 4 (s..s+3)
      if (s + 3 < S)
      {
        LinearExpr blockSum;
        for (int t = 0; t < 4; ++t)
          blockSum += y[i][s + t];
        model.AddGreaterOrEqual(blockSum, LinearExpr(start[i][s]) * 4);
      }
      else
      {
        // can't start near the end -> force start=0
        model.AddEquality(start[i][s], 0);
      }
    }
  }

  // Compute load per interviewer
  vector<IntVar> load(I);
  for (int i = 0; i < I; ++i)
  {
    load[i] = model.NewIntVar(0, S, "load_" + to_string(i));
    LinearExpr sumy;
    for (int s = 0; s < S; ++s)
      sumy += y[i][s];
    model.AddEquality(load[i], sumy);
  }

  IntVar max_load = model.NewIntVar(0, S, "max_load");
  IntVar min_load = model.NewIntVar(0, S, "min_load");
  model.AddMaxEquality(max_load, load);
  model.AddMinEquality(min_load, load);

  // Objective: minimize imbalance (max - min)
  model.Minimize(LinearExpr(max_load) - LinearExpr(min_load));

  // Solver parameters
  Model m;
  SatParameters params;
  params.set_max_time_in_seconds(30.0); // adjust as needed
  params.set_num_search_workers(8);
  params.set_log_search_progress(false);
  m.Add(NewSatParameters(params));

  // Solve
  const CpSolverResponse response = SolveCpModel(model.Build(), &m);

  // Output result
  json out;
  out["status"] = CpSolverStatus_Name(response.status());
  out["objective_value"] = response.objective_value();

  // Candidate assignments
  out["assignments"] = json::array();
  for (int c = 0; c < C; ++c)
  {
    int assigned_s = -1;
    for (int s = 0; s < S; ++s)
    {
      if (SolutionBooleanValue(response, x[c][s]))
      {
        assigned_s = s;
        break;
      }
    }
    json rec;
    rec["candidate_id"] = candidates[c].id;
    if (assigned_s >= 0)
    {
      rec["slot"] = slots[assigned_s];
      // list interviewers for this candidate
      rec["interviewers"] = json::array();
      for (int i = 0; i < I; ++i)
      {
        if (SolutionBooleanValue(response, z[c][i][assigned_s]))
          rec["interviewers"].push_back(interviewers[i].id);
      }
    }
    else
    {
      rec["slot"] = nullptr;
      rec["interviewers"] = json::array();
    }
    out["assignments"].push_back(rec);
  }

  // Interviewer schedules
  out["interviewer_schedules"] = json::array();
  for (int i = 0; i < I; ++i)
  {
    json rec;
    rec["interviewer_id"] = interviewers[i].id;
    rec["slots"] = json::array();
    for (int s = 0; s < S; ++s)
    {
      if (SolutionBooleanValue(response, y[i][s]))
        rec["slots"].push_back(slots[s]);
    }
    rec["load"] = SolutionIntegerValue(response, load[i]);
    out["interviewer_schedules"].push_back(rec);
  }

  // Save to file
  std::ofstream ofs(outfile);
  ofs << setw(2) << out << endl;
  cout << "Solved. Status: " << CpSolverStatus_Name(response.status()) << ", objective: " << response.objective_value() << "\n";
  cout << "Result written to " << outfile << "\n";
  return 0;
}