# Makefile for Interview Scheduler with GLPK (Windows compatible)

# Compiler settings
CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2

# GLPK library settings
GLPK_LIB = -lglpk
GLPK_INCLUDE = 

# Target executables
TARGET_GLPK = interview_scheduler_dev.exe

# Source files
SOURCES_GLPK = interview_scheduler_dev.cpp

# Object files
OBJECTS_GLPK = $(SOURCES_GLPK:.cpp=.o)

# Default target
all: $(TARGET_GLPK)

# Build the GLPK executable
$(TARGET_GLPK): $(OBJECTS_GLPK)
	$(CXX) $(OBJECTS_GLPK) -o $(TARGET_GLPK) $(GLPK_LIB)

# Compile GLPK source files
%.o: %.cpp
	$(CXX) $(CXXFLAGS) $(GLPK_INCLUDE) -c $< -o $@

# Clean build files (Windows compatible)
clean:
	@if exist $(OBJECTS_GLPK) del $(OBJECTS_GLPK)
	@if exist $(TARGET_GLPK) del $(TARGET_GLPK)

# Install dependencies (Windows with MSYS2/MinGW)
install-deps-windows:
	@echo "Installing GLPK on Windows..."
	@echo "Please install MSYS2 from https://www.msys2.org/"
	@echo "Then run: pacman -S mingw-w64-x86_64-glpk"
	@echo ""
	@echo "For nlohmann/json:"
	@echo "pacman -S mingw-w64-x86_64-nlohmann-json"

# Install dependencies (Ubuntu/Debian)
install-deps-ubuntu:
	@echo "Installing GLPK on Ubuntu/Debian..."
	sudo apt-get update
	sudo apt-get install libglpk-dev nlohmann-json3-dev

# Install dependencies (macOS with Homebrew)
install-deps-macos:
	@echo "Installing GLPK on macOS..."
	brew install glpk nlohmann-json

# Run the GLPK program
run-glpk: $(TARGET_GLPK)
	./$(TARGET_GLPK) input_glpk.json

# Help
help:
	@echo "Available targets:"
	@echo "  all              - Build all executables"
	@echo "  $(TARGET_GLPK)   - Build the GLPK executable"
	@echo "  clean            - Remove build files"
	@echo "  install-deps-*   - Install dependencies"
	@echo "  run-glpk         - Build and run GLPK scheduler"
	@echo "  help             - Show this help message"

.PHONY: all clean install-deps-windows install-deps-ubuntu install-deps-macos run-glpk run-new help
