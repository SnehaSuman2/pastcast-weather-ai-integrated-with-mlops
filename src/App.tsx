import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import WeatherForm from './components/WeatherForm';
import WeatherResults from './components/WeatherResults';
import GlobalWeather from './components/GlobalWeather';
import ComparisonView from './components/ComparisonView';
import ComparisonResults from './components/ComparisonResults';
import EnhancedAIChat from './components/EnhancedAIChat';
import ChatbotWidget from './components/ChatbotWidget';
import LoadingScreen from './components/LoadingScreen';
import { LocationInput, WeatherData } from './types/weather';

function App() {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [activeTab, setActiveTab] = useState('weather');
  const [isLoading, setIsLoading] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showWeatherHighlight, setShowWeatherHighlight] = useState(false);

  // Fallback timeout to ensure app loads even if loading screen fails
  useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      if (isAppLoading) {
        console.log('Fallback: Loading screen timeout, showing weather tab');
        setIsAppLoading(false);
        setActiveTab('weather');
        setShowWeatherHighlight(true);
        setTimeout(() => setShowWeatherHighlight(false), 2000);
      }
    }, 10000); // 10 second fallback

    return () => clearTimeout(fallbackTimer);
  }, [isAppLoading]);

  // Scroll animation effect
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate');
        }
      });
    }, observerOptions);

    // Observe all elements with scroll-animate class
    const animateElements = document.querySelectorAll('.scroll-animate');
    animateElements.forEach((el) => observer.observe(el));

    return () => {
      animateElements.forEach((el) => observer.unobserve(el));
    };
  }, [activeTab]);

  // Handle loading screen completion
  const handleLoadingComplete = () => {
    console.log('Loading completed, switching to weather tab');
    setIsAppLoading(false);
    // Automatically set to weather forecast tab after loading
    setActiveTab('weather');
    // Show highlight effect for the weather tab
    setShowWeatherHighlight(true);
    // Remove highlight after animation
    setTimeout(() => setShowWeatherHighlight(false), 2000);
  };

  // Show loading screen initially
  if (isAppLoading) {
    return <LoadingScreen onComplete={handleLoadingComplete} />;
  }

  const handleWeatherSubmit = async (location: LocationInput, startDate: string, endDate?: string, datasetMode?: 'IMD' | 'Global' | 'Combined') => {
    setIsLoading(true);
    try {
      // Make actual API call to the mock server
      const response = await fetch('http://localhost:8000/weather/probability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location,
          date_range: {
            start_date: startDate,
            end_date: endDate
          },
          dataset_mode: datasetMode
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const weatherData: WeatherData = await response.json();
      const mlResult = await getMLPrediction(30, 70);
      alert(`Prediction: ${mlResult?.prediction}`);
      setWeatherData(weatherData);
      setShowComparison(false);
    } catch (error) {
      console.error('Error fetching weather data:', error);
      // Show error message to user
      alert('Failed to fetch weather data. Please try again or use the Global Weather tab for real-time data.');
    } finally {
      setIsLoading(false);
    }
  };

  const getMLPrediction = async (temp: number, humidity: number) => {
  try {
    const response = await fetch('http://127.0.0.1:8000/ml/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ temp, humidity }),
    });

    const data = await response.json();
    console.log("ML Prediction:", data);

    return data;
  } catch (error) {
    console.error("ML error:", error);
  }
};

  const handleComparisonSubmit = async (locations: LocationInput[], startDate: string, endDate?: string, datasetMode?: 'IMD' | 'Global' | 'Combined') => {
    setIsLoading(true);
    try {
      // Make API calls for each location
      const comparisonPromises = locations.map(async (location) => {
        const response = await fetch('http://localhost:8000/weather/probability', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
        location,
        date_range: {
          start_date: startDate,
          end_date: endDate
        },
            dataset_mode: datasetMode
          })
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }

        return await response.json();
      });

      const comparisonResults = await Promise.all(comparisonPromises);
      
      // Create a combined comparison result
      const comparisonData = {
        locations: comparisonResults.map((result, index) => ({
          location: result.location,
          probabilities: result.probabilities,
          data_quality: result.probabilities.summary.data_quality,
          risk_level: result.probabilities.summary.risk_level
        })),
        analysis_period: comparisonResults[0]?.analysis_period || 'Comparison Analysis',
        data_sources: comparisonResults[0]?.data_sources || [],
        comparison_summary: {
          best_locations: getBestLocations(comparisonResults),
          worst_locations: getWorstLocations(comparisonResults),
          overall_risk: calculateOverallRisk(comparisonResults)
        }
      };

      setComparisonData(comparisonData);
      setShowComparison(true);
    } catch (error) {
      console.error('Error fetching comparison data:', error);
      alert('Failed to fetch comparison data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions for comparison analysis
  const getBestLocations = (results: any[]) => {
    const bestLocations: { [key: string]: string } = {};
    const conditions = ['rain', 'extreme_heat', 'high_wind', 'cloudy', 'good_weather'];
    
    conditions.forEach(condition => {
      let bestLocation = '';
      let bestValue = condition === 'good_weather' ? -1 : 999;
      
      results.forEach((result, index) => {
        const prob = result.probabilities[condition]?.probability;
        if (prob !== null && prob !== undefined) {
          if (condition === 'good_weather') {
            if (prob > bestValue) {
              bestValue = prob;
              bestLocation = result.location.city_name || `Location ${index + 1}`;
            }
          } else {
            if (prob < bestValue) {
              bestValue = prob;
              bestLocation = result.location.city_name || `Location ${index + 1}`;
            }
          }
        }
      });
      
      if (bestLocation) {
        bestLocations[condition] = bestLocation;
      }
    });
    
    return bestLocations;
  };

  const getWorstLocations = (results: any[]) => {
    const worstLocations: { [key: string]: string } = {};
    const conditions = ['rain', 'extreme_heat', 'high_wind', 'cloudy', 'good_weather'];
    
    conditions.forEach(condition => {
      let worstLocation = '';
      let worstValue = condition === 'good_weather' ? 999 : -1;
      
      results.forEach((result, index) => {
        const prob = result.probabilities[condition]?.probability;
        if (prob !== null && prob !== undefined) {
          if (condition === 'good_weather') {
            if (prob < worstValue) {
              worstValue = prob;
              worstLocation = result.location.city_name || `Location ${index + 1}`;
            }
          } else {
            if (prob > worstValue) {
              worstValue = prob;
              worstLocation = result.location.city_name || `Location ${index + 1}`;
            }
          }
        }
      });
      
      if (worstLocation) {
        worstLocations[condition] = worstLocation;
      }
    });
    
    return worstLocations;
  };

  const calculateOverallRisk = (results: any[]) => {
    const riskLevels = results.map(result => result.probabilities.summary.risk_level);
    const riskCounts = riskLevels.reduce((acc, risk) => {
      acc[risk] = (acc[risk] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
    
    const maxRisk = Object.keys(riskCounts).reduce((a, b) => riskCounts[a] > riskCounts[b] ? a : b);
    return maxRisk;
  };


  console.log('App rendering, activeTab:', activeTab, 'isAppLoading:', isAppLoading);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      {/* Professional Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Subtle Gradient Orbs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-gradient-to-r from-blue-600/10 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-gradient-to-r from-indigo-600/10 to-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }}></div>
        <div className="absolute top-1/3 right-1/3 w-48 h-48 bg-gradient-to-r from-slate-600/8 to-blue-500/8 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '6s' }}></div>
        
        {/* Professional Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.02]">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
            backgroundSize: '20px 20px'
          }}></div>
        </div>
        
        {/* Subtle Floating Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={`element-${i}`}
              className="absolute opacity-5"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 10}s`,
                animationDuration: `${15 + Math.random() * 20}s`
              }}
            >
              <div className="w-16 h-8 bg-white/30 rounded-full blur-sm"></div>
            </div>
          ))}
        </div>
        
        
        {/* Subtle Particle System */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 bg-white/20 rounded-full animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 8}s`,
                animationDuration: `${3 + Math.random() * 4}s`
              }}
            ></div>
          ))}
        </div>
        
        {/* Gradient Mesh Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5 opacity-60"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-blue-500/5 to-transparent"></div>
      </div>
      
      <Header />
      
      <main className="container mx-auto px-4 py-4 relative z-10">
                    {/* Professional Tab Navigation */}
        <div className="flex justify-center mb-4">
                        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-2 border border-white/10 shadow-xl hover:shadow-blue-500/10 transition-all duration-300">
                            <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('weather')}
                                    className={`px-6 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 relative overflow-hidden group button-interactive ${
                activeTab === 'weather'
                                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 professional-pulse'
                                            : 'text-white/80 hover:text-white hover:bg-white/10 hover:shadow-md hover:shadow-blue-500/20'
                                    } ${showWeatherHighlight ? 'ring-4 ring-blue-400/50 ring-opacity-75 animate-pulse' : ''}`}
                                >
                                    <div className="flex items-center space-x-2 relative z-10">
                                        <svg className="w-5 h-5 group-hover:rotate-6 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                        </svg>
                                        <span className="group-hover:tracking-wide transition-all duration-300">Weather Forecast</span>
                                    </div>
                                </button>
              <button
                onClick={() => setActiveTab('global')}
                className={`px-6 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 relative overflow-hidden group button-interactive ${
                  activeTab === 'global'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 professional-pulse'
                    : 'text-white/80 hover:text-white hover:bg-white/10 hover:shadow-md hover:shadow-blue-500/20'
                }`}
              >
                <div className="flex items-center space-x-2 relative z-10">
                  <svg className="w-5 h-5 group-hover:rotate-6 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="group-hover:tracking-wide transition-all duration-300">Global Weather</span>
                </div>
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
                className={`px-6 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 relative overflow-hidden group button-interactive ${
                activeTab === 'comparison'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 professional-pulse'
                    : 'text-white/80 hover:text-white hover:bg-white/10 hover:shadow-md hover:shadow-blue-500/20'
                }`}
              >
                <div className="flex items-center space-x-2 relative z-10">
                  <svg className="w-5 h-5 group-hover:rotate-6 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="group-hover:tracking-wide transition-all duration-300">Compare Locations</span>
                </div>
            </button>
            <button
              onClick={() => setActiveTab('chat')}
                className={`px-6 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 relative overflow-hidden group button-interactive ${
                activeTab === 'chat'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 professional-pulse'
                    : 'text-white/80 hover:text-white hover:bg-white/10 hover:shadow-md hover:shadow-blue-500/20'
                }`}
              >
                <div className="flex items-center space-x-2 relative z-10">
                  <svg className="w-5 h-5 group-hover:rotate-6 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="group-hover:tracking-wide transition-all duration-300">AI Assistant</span>
                </div>
            </button>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'weather' && (
          <div
            id="weather-forecast-section"
            className="space-y-6"
          >
            {/* Debug Message */}
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-green-400 text-sm">
                                ✅ Weather Forecast Tab is Active - Loading screen completed successfully!
                            </div>
                            
                            {/* Welcome Message */}
                            {showWeatherHighlight && (
                                <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 backdrop-blur-md rounded-2xl p-6 border border-blue-400/20 shadow-lg slide-in-left">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-white font-semibold text-lg">Welcome to PastCast Weather Forecast!</h3>
                                            <p className="text-white/80 text-sm">Get historical weather probability data for any location and date range.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-xl hover:shadow-blue-500/10 transition-all duration-300 relative overflow-hidden group slide-in-left">
                                    <div className="relative z-10">
              <WeatherForm onSubmit={handleWeatherSubmit} isLoading={isLoading} />
            </div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-xl hover:shadow-blue-500/10 transition-all duration-300 relative overflow-hidden group slide-in-right">
                                  <div className="relative z-10">
              {weatherData ? (
                <WeatherResults data={weatherData} />
              ) : (
                                    <div className="text-center text-white/70 py-12">
                                      <div className="mb-4">
                                        <svg className="w-16 h-16 mx-auto text-blue-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                        </svg>
                                      </div>
                                      <p className="text-lg font-medium">Enter location and date to get weather forecast</p>
                                      <p className="text-sm mt-2">Select a location on the map and choose your date range</p>
                                    </div>
                                  )}
                                  </div>
                                </div>
                            </div>
                </div>
              )}

        {activeTab === 'global' && (
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-xl hover:shadow-blue-500/10 transition-all duration-300 relative overflow-hidden group scroll-animate fade-in-up">
            <div className="relative z-10">
              <GlobalWeather />
            </div>
          </div>
        )}

        {activeTab === 'comparison' && (
                  <div className="space-y-8 scroll-animate">
                    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-xl hover:shadow-blue-500/10 transition-all duration-300 relative overflow-hidden group slide-in-left">
                      <div className="relative z-10">
            <ComparisonView onSubmit={handleComparisonSubmit} isLoading={isLoading} />
                      </div>
                    </div>
                    
                    {/* Loading Overlay */}
                    {isLoading && (
                      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl text-center">
                          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                          </div>
                          <h3 className="text-white text-xl font-semibold mb-2">Analyzing Weather Data</h3>
                          <p className="text-white/70">Comparing locations and generating insights...</p>
                          <div className="mt-4 w-64 bg-white/10 rounded-full h-2 mx-auto">
                            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {showComparison && comparisonData && (
                      <div className="animate-in fade-in-50 duration-700">
                        <ComparisonResults data={comparisonData} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-xl hover:shadow-blue-500/10 transition-all duration-300 relative overflow-hidden group scroll-animate fade-in-up">
            <div className="relative z-10">
            <EnhancedAIChat />
            </div>
          </div>
        )}
      </main>

      {/* AI Chatbot Widget - Always visible */}
      <ChatbotWidget />
    </div>
  );
}

export default App;
