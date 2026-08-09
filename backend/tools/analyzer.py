import pandas as pd
import json
from typing import Optional
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, r2_score

def analyze_data(file_path: str) -> dict:
    try:
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.endswith('.xlsx'):
            df = pd.read_excel(file_path)
        else:
            raise ValueError("Unsupported file format for analysis. Please use CSV or Excel.")

        analysis = {
            "shape": list(df.shape),
            "columns": list(df.columns),
            "dtypes": df.dtypes.astype(str).to_dict(),
            "describe": df.describe(include='all').fillna("").to_dict(),
            "null_counts": df.isnull().sum().to_dict(),
            "first_5_rows": df.head(5).fillna("").to_dict(orient="records")
        }
        return analysis
    except Exception as e:
        return {"error": str(e)}

def predict_data(file_path: str, target_column: str, features: list = None) -> dict:
    try:
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        elif file_path.endswith('.xlsx'):
            df = pd.read_excel(file_path)
        else:
            raise ValueError("Unsupported file format.")

        if target_column not in df.columns:
            raise ValueError(f"Target column '{target_column}' not found.")

        # Drop rows where target is missing
        df = df.dropna(subset=[target_column])
        
        if features is None:
            features = [col for col in df.columns if col != target_column]
            
        X = df[features]
        y = df[target_column]
        
        # Handle missing values in X
        X = X.fillna(X.mode().iloc[0] if len(X.mode()) > 0 else 0)

        # Encode categoricals in X
        label_encoders = {}
        for col in X.select_dtypes(include=['object']).columns:
            le = LabelEncoder()
            X.loc[:, col] = le.fit_transform(X[col].astype(str))
            label_encoders[col] = le

        is_classification = False
        if y.dtype == 'object' or y.nunique() <= 10:
            is_classification = True
            if y.dtype == 'object':
                le_y = LabelEncoder()
                y = le_y.fit_transform(y.astype(str))

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        if is_classification:
            model = RandomForestClassifier(random_state=42)
            model_type = "Classification (RandomForestClassifier)"
            model.fit(X_train, y_train)
            preds = model.predict(X_test)
            score = accuracy_score(y_test, preds)
            metric_name = "accuracy"
        else:
            model = RandomForestRegressor(random_state=42)
            model_type = "Regression (RandomForestRegressor)"
            model.fit(X_train, y_train)
            preds = model.predict(X_test)
            score = r2_score(y_test, preds)
            metric_name = "r2_score"

        feature_importances = None
        if hasattr(model, 'feature_importances_'):
            importances = model.feature_importances_
            feature_importances = {feat: float(imp) for feat, imp in zip(X.columns, importances)}
            feature_importances = dict(sorted(feature_importances.items(), key=lambda item: item[1], reverse=True))

        return {
            "model_type": model_type,
            "score": f"{score:.4f} ({metric_name})",
            "feature_importances": feature_importances,
            "test_predictions_sample": preds[:10].tolist(),
            "target_column": target_column
        }

    except Exception as e:
        return {"error": str(e)}

def format_analysis_for_llm(analysis: dict) -> str:
    if "error" in analysis:
        return f"Error during analysis: {analysis['error']}"
    
    formatted = []
    formatted.append(f"Dataset Shape: {analysis.get('shape', 'N/A')}")
    formatted.append(f"Columns: {', '.join(analysis.get('columns', []))}")
    formatted.append("\nData Types:")
    for col, dtype in analysis.get('dtypes', {}).items():
        formatted.append(f" - {col}: {dtype}")
    
    formatted.append("\nNull Counts:")
    for col, count in analysis.get('null_counts', {}).items():
        if count > 0:
            formatted.append(f" - {col}: {count} nulls")
            
    formatted.append("\nFirst 5 Rows:")
    try:
        formatted.append(json.dumps(analysis.get('first_5_rows', []), indent=2))
    except:
        pass
        
    return "\n".join(formatted)
