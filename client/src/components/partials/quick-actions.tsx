import { actions } from "@/constants/dummy-data";
import { cn } from "@/lib/utils";
import React from "react";

const QuickActions = () => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={index}
              className="flex items-start space-x-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center text-white transition-colors",
                  action.color
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  {action.title}
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  {action.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickActions;
